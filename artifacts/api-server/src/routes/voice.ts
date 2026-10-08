import { Router, type Response } from "express";
import { Resend } from "resend";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { validTwilioRequest } from "../lib/voice-security";

/** The first pilot uses a controlled interview so a failed AI request cannot lose a caller's message. */
const questions = [
  ["name", "Please tell me your full name."],
  ["phone", "What is the best number to call you back on? You can also say, this number."],
  ["work", "Please describe the work you need, with as much detail as you can."],
  ["address", "What is the job address and postcode?"],
  ["urgency", "Is this urgent or dangerous, or is it a routine enquiry?"],
  ["availability", "When would you be available for a call or visit?"],
] as const;
type Field = (typeof questions)[number][0];
type Answers = Partial<Record<Field, string>>;
type Session = {
  call_sid: string;
  caller_phone: string;
  call_id: number | null;
  step: number;
  retries: number;
  answers: Answers;
  completed: boolean;
  notification_status: string;
  customer_confirmation_status: string;
};

const router = Router();

function xml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function twiml(res: Response, body: string): void {
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);
}

router.use((req, res, next) => {
  if (!process.env.TWILIO_AUTH_TOKEN || !process.env.VOICE_PUBLIC_BASE_URL) {
    res.status(503).json({ error: "Voice webhook is not configured" });
    return;
  }
  if (!validTwilioRequest(req)) {
    res.status(403).json({ error: "Invalid voice webhook signature" });
    return;
  }
  next();
});

function ask(step: number, prefix = ""): string {
  const question = questions[step]?.[1];
  if (!question) return "<Say>Thank you. We have your message and will be in touch.</Say><Hangup/>";
  return `<Gather input="speech" language="en-GB" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="/api/voice/answer?step=${step}"><Say voice="alice" language="en-GB">${xml(prefix + question)}</Say></Gather>`;
}

async function ensureSession(sid: string, from: string, to: string): Promise<Session> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO voice_call_sessions(call_sid, caller_phone, called_phone) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [sid, from, to],
    );
    const result = await client.query<Session>("SELECT * FROM voice_call_sessions WHERE call_sid=$1 FOR UPDATE", [sid]);
    const session = result.rows[0];
    if (!session.call_id) {
      const assistant = await client.query<{ name: string }>("SELECT name FROM assistants WHERE active=true AND type='phone' ORDER BY created_at LIMIT 1");
      const call = await client.query<{ id: number }>(
        "INSERT INTO calls(caller_name,caller_phone,assistant_name,status,outcome,notes,transcript) VALUES ($1,$2,$3,'unresolved','New phone enquiry','Call in progress','[]'::jsonb) RETURNING id",
        ["Unknown caller", from, assistant.rows[0]?.name ?? "CREWON Receptionist"],
      );
      session.call_id = call.rows[0].id;
      await client.query("UPDATE voice_call_sessions SET call_id=$2 WHERE call_sid=$1", [sid, session.call_id]);
    }
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function callbackNumber(answers: Answers, caller: string): string {
  const stated = answers.phone?.trim() ?? "";
  return /this number|same number|number calling/i.test(stated) || !stated ? caller : stated;
}

function summary(answers: Answers, caller: string): string {
  return [
    `Name: ${answers.name || "Not captured"}`,
    `Callback: ${callbackNumber(answers, caller)}`,
    `Work: ${answers.work || "Not captured"}`,
    `Site: ${answers.address || "Not captured"}`,
    `Urgency: ${answers.urgency || "Not captured"}`,
    `Availability: ${answers.availability || "Not captured"}`,
  ].join("\n");
}

export async function notifyOwner(sid: string): Promise<void> {
  const claim = await pool.query<Session>(
    "UPDATE voice_call_sessions SET notification_status='sending' WHERE call_sid=$1 AND notification_status='pending' RETURNING *",
    [sid],
  );
  const session = claim.rows[0];
  if (!session) return;
  try {
    const company = await pool.query<{ name: string; email: string | null }>("SELECT name,email FROM companies ORDER BY id LIMIT 1");
    const recipient = company.rows[0]?.email;
    const from = process.env.RESEND_FROM_EMAIL;
    const key = process.env.RESEND_API_KEY;
    if (!recipient || !from || !key) {
      await pool.query("UPDATE voice_call_sessions SET notification_status='unconfigured' WHERE call_sid=$1", [sid]);
      return;
    }
    const urgent = /urgent|danger|sparking|fire|shock|burning|no power/i.test(session.answers.urgency ?? "");
    const result = await new Resend(key).emails.send({
      from: `CREWON <${from}>`,
      to: [recipient],
      subject: `${urgent ? "URGENT: " : ""}New phone enquiry — ${session.answers.name || session.caller_phone}`,
      text: `${summary(session.answers, session.caller_phone)}\n\nReview the full call in CREWON.`,
    }, { idempotencyKey: `crewon-voice-${sid}` });
    const status = result.error ? "failed" : "sent";
    await pool.query("UPDATE voice_call_sessions SET notification_status=$2 WHERE call_sid=$1", [sid, status]);
  } catch (error) {
    logger.error({ err: error, sid }, "Voice enquiry notification failed");
    await pool.query("UPDATE voice_call_sessions SET notification_status='failed' WHERE call_sid=$1", [sid]);
  }
}

async function confirmToCaller(sid: string): Promise<void> {
  const claim = await pool.query<Session>(
    "UPDATE voice_call_sessions SET customer_confirmation_status='sending' WHERE call_sid=$1 AND customer_confirmation_status='pending' RETURNING *",
    [sid],
  );
  const session = claim.rows[0];
  if (!session) return;
  const account = process.env.TWILIO_ACCOUNT_SID;
  const from = process.env.TWILIO_SMS_FROM;
  const token = process.env.TWILIO_AUTH_TOKEN;
  // The verified inbound caller number is safer than a speech-recognised number.
  if (!account || !from || !token || !/^\+\d{8,15}$/.test(session.caller_phone)) {
    await pool.query("UPDATE voice_call_sessions SET customer_confirmation_status='unconfigured' WHERE call_sid=$1", [sid]);
    return;
  }
  try {
    const company = await pool.query<{ name: string }>("SELECT name FROM companies ORDER BY id LIMIT 1");
    const name = company.rows[0]?.name ?? "the team";
    const body = new URLSearchParams({
      To: session.caller_phone,
      From: from,
      Body: `Thanks for calling ${name}. We have your enquiry and will be in touch. If there is immediate danger, contact the appropriate emergency service.`,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    await pool.query("UPDATE voice_call_sessions SET customer_confirmation_status=$2 WHERE call_sid=$1", [sid, response.ok ? "sent" : "failed"]);
  } catch (error) {
    logger.error({ err: error, sid }, "Caller confirmation failed");
    await pool.query("UPDATE voice_call_sessions SET customer_confirmation_status='failed' WHERE call_sid=$1", [sid]);
  }
}

async function finish(sid: string): Promise<void> {
  const client = await pool.connect();
  let shouldNotify = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<Session>("SELECT * FROM voice_call_sessions WHERE call_sid=$1 FOR UPDATE", [sid]);
    const session = result.rows[0];
    if (!session || session.completed) { await client.query("COMMIT"); return; }
    const a = session.answers;
    const phone = callbackNumber(a, session.caller_phone);
    // Serialise matching so two calls from the same number cannot create two contacts.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [phone]);
    let contact = await client.query<{ id: number }>("SELECT id FROM contacts WHERE phone=$1 ORDER BY id LIMIT 1", [phone]);
    if (!contact.rows.length) {
      contact = await client.query<{ id: number }>(
        "INSERT INTO contacts(name,phone,address,type,notes) VALUES ($1,$2,$3,'lead',$4) RETURNING id",
        [a.name || "Unknown caller", phone, a.address || null, "Captured by CREWON phone receptionist"],
      );
    }
    const urgent = /urgent|danger|sparking|fire|shock|burning|no power/i.test(a.urgency ?? "");
    const transcript = questions.flatMap(([field, question], index) => a[field] ? [
      { speaker: "assistant", text: question, timestamp: index * 2 },
      { speaker: "caller", text: a[field], timestamp: index * 2 + 1 },
    ] : []);
    await client.query(
      "UPDATE calls SET caller_name=$2,caller_phone=$3,contact_id=$4,status='unresolved',outcome=$5,notes=$6,transcript=$7::jsonb,updated_at=now() WHERE id=$1",
      [session.call_id, a.name || "Unknown caller", phone, contact.rows[0].id, urgent ? "Urgent — review promptly" : "New enquiry — follow up", summary(a, session.caller_phone), JSON.stringify(transcript)],
    );
    await client.query("UPDATE voice_call_sessions SET completed=true,updated_at=now() WHERE call_sid=$1", [sid]);
    await client.query("COMMIT");
    shouldNotify = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (shouldNotify) {
    const results = await Promise.allSettled([notifyOwner(sid), confirmToCaller(sid)]);
    for (const result of results) {
      if (result.status === "rejected") logger.error({ err: result.reason, sid }, "Voice notification state could not be recorded");
    }
  }
}

router.post("/voice/incoming", async (req, res): Promise<void> => {
  const sid = String(req.body.CallSid ?? "");
  if (!/^CA[a-fA-F0-9]{32}$/.test(sid)) { res.status(400).end(); return; }
  try {
    const session = await ensureSession(sid, String(req.body.From ?? ""), String(req.body.To ?? ""));
    if (session.completed) { twiml(res, "<Say>Thank you. Goodbye.</Say><Hangup/>"); return; }
    twiml(res, ask(session.step, session.step === 0 ? "Thank you for calling. I'll take your full message so the team can get back to you. " : ""));
  } catch (error) { logger.error({ err: error }, "Voice incoming failed"); res.status(500).end(); }
});

router.post("/voice/answer", async (req, res): Promise<void> => {
  const sid = String(req.body.CallSid ?? "");
  const expectedStep = Number(req.query.step);
  if (!/^CA[a-fA-F0-9]{32}$/.test(sid) || !Number.isInteger(expectedStep) || expectedStep < 0 || expectedStep >= questions.length) {
    res.status(400).end(); return;
  }
  const client = await pool.connect();
  let nextStep = 0;
  let done = false;
  let prefix = "";
  try {
    await client.query("BEGIN");
    const result = await client.query<Session>("SELECT * FROM voice_call_sessions WHERE call_sid=$1 FOR UPDATE", [sid]);
    const session = result.rows[0];
    if (!session) { await client.query("ROLLBACK"); res.status(404).end(); return; }
    if (session.completed) { await client.query("COMMIT"); twiml(res, "<Say>Thank you. Goodbye.</Say><Hangup/>"); return; }
    if (session.step === expectedStep) {
      const speech = typeof req.body.SpeechResult === "string" ? req.body.SpeechResult.trim().slice(0, 1000) : "";
      if (speech) {
        const field = questions[session.step][0];
        session.answers = { ...session.answers, [field]: speech };
        session.step += 1;
        session.retries = 0;
      } else if (session.retries < 1) {
        session.retries += 1;
        prefix = "Sorry, I didn't catch that. ";
      } else {
        session.step += 1;
        session.retries = 0;
        prefix = "That's okay. ";
      }
      await client.query(
        "UPDATE voice_call_sessions SET answers=$2::jsonb,step=$3,retries=$4,updated_at=now() WHERE call_sid=$1",
        [sid, JSON.stringify(session.answers), session.step, session.retries],
      );
      // Preserve partial answers after each turn, even before finalisation.
      await client.query("UPDATE calls SET notes=$2,updated_at=now() WHERE id=$1", [session.call_id, summary(session.answers, session.caller_phone)]);
    }
    nextStep = session.step;
    done = nextStep >= questions.length;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ err: error, sid }, "Voice answer failed");
    res.status(500).end(); return;
  } finally { client.release(); }
  if (done) {
    try { await finish(sid); } catch (error) { logger.error({ err: error, sid }, "Voice finalisation failed"); res.status(500).end(); return; }
    twiml(res, "<Say voice=\"alice\" language=\"en-GB\">Thank you. We have your message and the team will be in touch.</Say><Hangup/>");
  } else twiml(res, ask(nextStep, prefix));
});

// Configure this URL as the Twilio number's status callback (completed event).
// It turns an interrupted interview into a visible partial enquiry.
router.post("/voice/status", async (req, res): Promise<void> => {
  const sid = String(req.body.CallSid ?? "");
  if (!/^CA[a-fA-F0-9]{32}$/.test(sid)) { res.status(400).end(); return; }
  if (["completed", "busy", "failed", "no-answer"].includes(String(req.body.CallStatus ?? ""))) {
    try { await finish(sid); } catch (error) { logger.error({ err: error, sid }, "Voice status failed"); res.status(500).end(); return; }
  }
  res.status(204).end();
});

export default router;

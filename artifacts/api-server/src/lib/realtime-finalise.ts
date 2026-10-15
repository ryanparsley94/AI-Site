import { Resend } from "resend";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { recordVoiceDiagnostic } from "./voice-diagnostics";

export type PhoneTranscriptEntry = {
  speaker: "caller" | "assistant";
  text: string;
  timestamp: number;
};

type ExtractedEnquiry = {
  name: string | null;
  callbackPhone: string | null;
  work: string | null;
  address: string | null;
  urgency: "emergency" | "urgent" | "routine" | "unknown";
  availability: string | null;
  summary: string;
  safetyConcern: boolean;
};

type FinaliseInput = {
  callSid: string;
  callId: number;
  companyId: number;
  assistantId: number;
  transcript: PhoneTranscriptEntry[];
  durationSeconds: number;
  notifyOwner?: boolean;
  confirmCaller?: boolean;
};

function fallbackExtraction(transcript: PhoneTranscriptEntry[]): ExtractedEnquiry {
  const callerText = transcript
    .filter((entry) => entry.speaker === "caller")
    .map((entry) => entry.text)
    .join(" ")
    .trim()
    .slice(0, 5000);

  return {
    name: null,
    callbackPhone: null,
    work: callerText || null,
    address: null,
    urgency: "unknown",
    availability: null,
    summary: callerText
      ? `Caller said: ${callerText}`
      : "Call ended before useful caller details were captured.",
    safetyConcern: false,
  };
}

async function extractEnquiry(transcript: PhoneTranscriptEntry[]): Promise<ExtractedEnquiry> {
  if (!process.env.OPENAI_API_KEY || transcript.length === 0) {
    return fallbackExtraction(transcript);
  }

  const conversation = transcript
    .map((entry) => `${entry.speaker === "caller" ? "CALLER" : "RECEPTIONIST"}: ${entry.text}`)
    .join("\n")
    .slice(0, 18000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_POSTCALL_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Extract a UK trade enquiry from this phone transcript. Use only facts explicitly stated by the caller. Never infer a missing name, phone number, address, price, diagnosis, appointment or service. Keep the summary concise and useful to a contractor. Set safetyConcern true only for a plausible immediate danger such as fire, smoke, burning, electric shock, exposed live conductors, gas leak, active flooding around electrics, or another life-safety hazard.",
          },
          { role: "user", content: conversation },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "crewon_phone_enquiry",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "callbackPhone",
                "work",
                "address",
                "urgency",
                "availability",
                "summary",
                "safetyConcern",
              ],
              properties: {
                name: { type: ["string", "null"] },
                callbackPhone: { type: ["string", "null"] },
                work: { type: ["string", "null"] },
                address: { type: ["string", "null"] },
                urgency: {
                  type: "string",
                  enum: ["emergency", "urgent", "routine", "unknown"],
                },
                availability: { type: ["string", "null"] },
                summary: { type: "string" },
                safetyConcern: { type: "boolean" },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Post-call extraction returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Post-call extraction returned no content");
    return JSON.parse(raw) as ExtractedEnquiry;
  } catch (error) {
    logger.warn({ err: error }, "Post-call extraction failed; raw transcript preserved");
    return fallbackExtraction(transcript);
  }
}

function e164ish(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim().replace(/[\s()-]/g, "");
  if (/^\+\d{8,15}$/.test(clean)) return clean;
  const digits = clean.replace(/\D/g, "");
  if (/^0\d{9,10}$/.test(digits)) return `+44${digits.slice(1)}`;
  return null;
}

function notesFor(
  enquiry: ExtractedEnquiry,
  verifiedInboundNumber: string,
): string {
  return [
    `Summary: ${enquiry.summary}`,
    `Name: ${enquiry.name || "Not captured"}`,
    `Verified inbound number: ${verifiedInboundNumber || "Not available"}`,
    `Callback number stated: ${enquiry.callbackPhone || "Not captured"}`,
    `Work: ${enquiry.work || "Not captured"}`,
    `Site: ${enquiry.address || "Not captured"}`,
    `Urgency: ${enquiry.urgency}`,
    `Availability: ${enquiry.availability || "Not captured"}`,
    "Next action: Review this call in CrewOn Office and follow up with the customer.",
  ]
    .join("\n")
    .slice(0, 9000);
}

async function notifyOwner(
  callSid: string,
  companyId: number,
  enquiry: ExtractedEnquiry,
  verifiedInboundNumber: string,
): Promise<void> {
  const claim = await pool.query(
    `UPDATE voice_call_sessions
        SET notification_status='sending',updated_at=now()
      WHERE call_sid=$1 AND notification_status='pending'
      RETURNING call_sid`,
    [callSid],
  );
  if (!claim.rows[0]) return;

  try {
    const company = await pool.query<{ name: string; email: string | null }>(
      "SELECT name,email FROM companies WHERE id=$1 LIMIT 1",
      [companyId],
    );
    const recipient = company.rows[0]?.email;
    const from = process.env.RESEND_FROM_EMAIL;
    const key = process.env.RESEND_API_KEY;

    if (!recipient || !from || !key) {
      await pool.query(
        `UPDATE voice_call_sessions
            SET notification_status='unconfigured',updated_at=now()
          WHERE call_sid=$1`,
        [callSid],
      );
      await recordVoiceDiagnostic({
        callSid,
        companyId,
        eventType: "notification_result",
        summary: "Owner notification was not configured.",
        details: { channel: "email", result: "unconfigured" },
      });
      return;
    }

    const urgent =
      enquiry.safetyConcern ||
      enquiry.urgency === "emergency" ||
      enquiry.urgency === "urgent";

    const result = await new Resend(key).emails.send(
      {
        from: `CREWON <${from}>`,
        to: [recipient],
        subject: `${urgent ? "URGENT: " : ""}New phone enquiry — ${enquiry.name || verifiedInboundNumber || "Unknown caller"}`,
        text: `${notesFor(enquiry, verifiedInboundNumber)}\n\nReview the full transcript in CREWON.`,
      },
      { idempotencyKey: `crewon-realtime-${callSid}` },
    );

    await pool.query(
      `UPDATE voice_call_sessions
          SET notification_status=$2,updated_at=now()
        WHERE call_sid=$1`,
      [callSid, result.error ? "failed" : "sent"],
    );
    await recordVoiceDiagnostic({
      callSid,
      companyId,
      eventType: "notification_result",
      summary: result.error ? "Owner email notification failed." : "Owner email notification was sent.",
      details: { channel: "email", result: result.error ? "failed" : "sent" },
    });
  } catch (error) {
    logger.error({ err: error, callSid }, "Realtime owner notification failed");
    await pool
      .query(
        `UPDATE voice_call_sessions
            SET notification_status='failed',updated_at=now()
          WHERE call_sid=$1`,
        [callSid],
      )
      .catch(() => undefined);
    await recordVoiceDiagnostic({
      callSid,
      companyId,
      eventType: "notification_result",
      summary: "Owner email notification failed.",
      details: { channel: "email", result: "failed" },
    });
  }
}

async function confirmCaller(
  callSid: string,
  companyId: number,
  verifiedInboundNumber: string,
): Promise<void> {
  const claim = await pool.query(
    `UPDATE voice_call_sessions
        SET customer_confirmation_status='sending',updated_at=now()
      WHERE call_sid=$1 AND customer_confirmation_status='pending'
      RETURNING call_sid`,
    [callSid],
  );
  if (!claim.rows[0]) return;

  const to = e164ish(verifiedInboundNumber);
  const account = process.env.TWILIO_ACCOUNT_SID;
  const from = process.env.TWILIO_SMS_FROM;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!to || !account || !from || !token) {
    await pool.query(
      `UPDATE voice_call_sessions
          SET customer_confirmation_status='unconfigured',updated_at=now()
        WHERE call_sid=$1`,
      [callSid],
    );
    await recordVoiceDiagnostic({
      callSid,
      companyId,
      eventType: "notification_result",
      summary: "Caller SMS confirmation was not configured.",
      details: { channel: "sms", result: "unconfigured" },
    });
    return;
  }

  try {
    const company = await pool.query<{ name: string }>(
      "SELECT name FROM companies WHERE id=$1 LIMIT 1",
      [companyId],
    );
    const businessName = company.rows[0]?.name ?? "the team";
    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `Thanks for calling ${businessName}. We have your enquiry and will be in touch. If there is immediate danger, contact the appropriate emergency service.`,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    await pool.query(
      `UPDATE voice_call_sessions
          SET customer_confirmation_status=$2,updated_at=now()
        WHERE call_sid=$1`,
      [callSid, response.ok ? "sent" : "failed"],
    );
    await recordVoiceDiagnostic({
      callSid,
      companyId,
      eventType: "notification_result",
      summary: response.ok ? "Caller SMS confirmation was sent." : "Caller SMS confirmation failed.",
      details: { channel: "sms", result: response.ok ? "sent" : "failed" },
    });
  } catch (error) {
    logger.error({ err: error, callSid }, "Realtime caller confirmation failed");
    await pool
      .query(
        `UPDATE voice_call_sessions
            SET customer_confirmation_status='failed',updated_at=now()
          WHERE call_sid=$1`,
        [callSid],
      )
      .catch(() => undefined);
    await recordVoiceDiagnostic({
      callSid,
      companyId,
      eventType: "notification_result",
      summary: "Caller SMS confirmation failed.",
      details: { channel: "sms", result: "failed" },
    });
  }
}

export async function finaliseRealtimeEnquiry(input: FinaliseInput): Promise<void> {
  const sessionResult = await pool.query<{
    caller_phone: string;
    completed: boolean;
  }>(
    "SELECT caller_phone,completed FROM voice_call_sessions WHERE call_sid=$1 LIMIT 1",
    [input.callSid],
  );
  const session = sessionResult.rows[0];
  if (!session || session.completed) return;

  const enquiry = await extractEnquiry(input.transcript);
  const verifiedInboundNumber = e164ish(session.caller_phone) ?? session.caller_phone;
  const primaryPhone =
    e164ish(session.caller_phone) ??
    e164ish(enquiry.callbackPhone) ??
    (session.caller_phone.trim() || "") ??
    "";

  const client = await pool.connect();
  let shouldNotify = false;
  let contactId: number | null = null;
  let linkedJobId: number | null = null;
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ completed: boolean }>(
      "SELECT completed FROM voice_call_sessions WHERE call_sid=$1 FOR UPDATE",
      [input.callSid],
    );
    if (!locked.rows[0] || locked.rows[0].completed) {
      await client.query("COMMIT");
      return;
    }

    if (primaryPhone) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`${input.companyId}:${primaryPhone}`],
      );

      const existing = await client.query<{
        id: number;
        name: string;
        address: string | null;
      }>(
        `SELECT id,name,address
           FROM contacts
          WHERE company_id=$1 AND phone=$2
          ORDER BY id
          LIMIT 1`,
        [input.companyId, primaryPhone],
      );

      if (existing.rows[0]) {
        contactId = existing.rows[0].id;
        const current = existing.rows[0];
        const name =
          (!current.name || /^unknown caller$/i.test(current.name)) && enquiry.name
            ? enquiry.name
            : current.name;
        const address = current.address || enquiry.address;
        await client.query(
          `UPDATE contacts
              SET name=$2,address=$3,updated_at=now()
            WHERE id=$1 AND company_id=$4`,
          [contactId, name || "Unknown caller", address || null, input.companyId],
        );
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO contacts(company_id,name,phone,address,type,notes)
           VALUES ($1,$2,$3,$4,'lead',$5)
           RETURNING id`,
          [
            input.companyId,
            enquiry.name || "Unknown caller",
            primaryPhone,
            enquiry.address || null,
            "Captured by CREWON Realtime phone receptionist",
          ],
        );
        contactId = inserted.rows[0].id;
      }
    }

    const urgent =
      enquiry.safetyConcern ||
      enquiry.urgency === "emergency" ||
      enquiry.urgency === "urgent";

    const linkedCall = await client.query<{ job_id: number | null }>(
      "SELECT job_id FROM calls WHERE id=$1 AND company_id=$2 LIMIT 1",
      [input.callId, input.companyId],
    );
    const hasBookedJob = linkedCall.rows[0]?.job_id != null;
    linkedJobId = linkedCall.rows[0]?.job_id ?? null;

    await client.query(
      `UPDATE calls
          SET company_id=$2,
              caller_name=$3,
              caller_phone=$4,
              contact_id=$5,
               status=CASE WHEN job_id IS NOT NULL THEN status ELSE 'unresolved' END,
               outcome=CASE WHEN job_id IS NOT NULL THEN 'Booked' ELSE $6 END,
              notes=$7,
              transcript=$8::jsonb,
              duration=$9,
              updated_at=now()
        WHERE id=$1`,
      [
        input.callId,
        input.companyId,
        enquiry.name || "Unknown caller",
        primaryPhone || "Unknown",
        contactId,
        urgent ? "Urgent — review promptly" : "New enquiry — follow up",
        notesFor(enquiry, verifiedInboundNumber),
        JSON.stringify(input.transcript),
        input.durationSeconds,
      ],
    );

    await client.query(
      `UPDATE voice_call_sessions
          SET answers=$2::jsonb,completed=true,updated_at=now()
        WHERE call_sid=$1`,
      [
        input.callSid,
        JSON.stringify({
          name: enquiry.name,
          phone: enquiry.callbackPhone,
          work: enquiry.work,
          address: enquiry.address,
          urgency: enquiry.urgency,
          availability: enquiry.availability,
          summary: enquiry.summary,
          safetyConcern: enquiry.safetyConcern,
        }),
      ],
    );

    await client.query(
      "UPDATE assistants SET calls_handled=calls_handled+1,updated_at=now() WHERE id=$1 AND company_id=$2",
      [input.assistantId, input.companyId],
    );

    if (urgent || !hasBookedJob) {
      await client.query(
        `INSERT INTO tasks(title,priority,status,source,company_id)
         VALUES ($1,$2,'pending','ai',$3)`,
        [
          `${urgent ? "Urgent phone enquiry" : "Phone enquiry follow-up"}: ${enquiry.name || primaryPhone || "Unknown caller"} — ${enquiry.work || enquiry.summary}`.slice(
            0,
            500,
          ),
          urgent ? "high" : "medium",
          input.companyId,
        ],
      );
    }

    await client.query("COMMIT");
    shouldNotify = true;
    await recordVoiceDiagnostic({
      callSid: input.callSid,
      callId: input.callId,
      companyId: input.companyId,
      eventType: "contact_job_linkage",
      summary: "Call contact and booking linkage was finalized.",
      details: { contactId, jobId: linkedJobId, booked: hasBookedJob },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (shouldNotify) {
    const notifications: Promise<void>[] = [];
    if (input.notifyOwner !== false) {
      notifications.push(notifyOwner(input.callSid, input.companyId, enquiry, verifiedInboundNumber));
    }
    if (input.confirmCaller !== false) {
      notifications.push(confirmCaller(input.callSid, input.companyId, verifiedInboundNumber));
    }
    const results = await Promise.allSettled(notifications);
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(
          { err: result.reason, callSid: input.callSid },
          "Realtime post-call notification failed",
        );
      }
    }
  }
}

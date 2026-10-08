import { Router } from "express";
import { eq, and, gte, lte, sql, or, isNull } from "drizzle-orm";
import {
  db,
  companiesTable,
  assistantsTable,
  assistantTrainingTable,
  contactsTable,
  callsTable,
  jobsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { Resend } from "resend";
import { logger } from "../lib/logger";

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function sendWidgetLeadNotification(
  company: typeof companiesTable.$inferSelect,
  visitorName: string,
  visitorPhone: string,
  chatSummary: string
): Promise<void> {
  const toEmail = company.email;
  if (!toEmail) return;

  const resend = getResendClient();
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping widget lead notification email");
    return;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@buildai.app";
  const subject = `New website lead: ${visitorName}`;
  const body =
    `You have a new lead from your website chat widget.\n\n` +
    `Name: ${visitorName}\n` +
    `Phone: ${visitorPhone}\n\n` +
    `Chat summary:\n${chatSummary}\n\n` +
    `Log in to CREWON to view the full conversation and follow up.`;

  try {
    const result = await resend.emails.send({
      from: `CREWON <${fromAddress}>`,
      to: [toEmail],
      subject,
      text: body,
    });
    if (result.error) {
      logger.error({ err: result.error }, "Resend rejected widget lead notification");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send widget lead notification email");
  }
}

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 1000;      // characters per user message
const MAX_SESSION_MESSAGES = 40;      // total messages per session (20 turns)
const RATE_WINDOW_MS = 60_000;        // 1 minute window
const RATE_MAX_REQUESTS = 20;         // max requests per key per window

// ─── In-memory session store ──────────────────────────────────────────────────
interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  companyId: number;
  messages: SessionMessage[];
  visitorName?: string;
  visitorPhone?: string;
  savedLeadId?: number;
  savedCallId?: number;
  bookingOffered?: boolean;
  bookingCompleted?: boolean;
  bookedJobId?: number;
  createdAt: Date;
}

const sessions = new Map<string, ChatSession>();

// Clean up sessions older than 2 hours
setInterval(() => {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000);

// ─── Per-key rate limiter ─────────────────────────────────────────────────────
interface RateEntry { count: number; windowStart: number }
const rateStore = new Map<string, RateEntry>();

// ─── In-flight booking lock (prevent concurrent same-slot inserts) ─────────────
// Keyed by slotIso string — held only for the duration of the DB insert.
const bookingInFlight = new Set<string>();

// ─── Deterministic int32 hash for advisory lock keys ──────────────────────────
function hashToInt32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) & 0x7fffffff; // positive int32
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateStore.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateStore.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

// Clean up old rate entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [key, entry] of rateStore.entries()) {
    if (entry.windowStart < cutoff) rateStore.delete(key);
  }
}, 5 * 60 * 1000);

// ─── Build system prompt ──────────────────────────────────────────────────────
function buildWidgetSystemPrompt(
  assistant: typeof assistantsTable.$inferSelect,
  trainingEntries: typeof assistantTrainingTable.$inferSelect[],
  company: typeof companiesTable.$inferSelect
): string {
  const parts: string[] = [];

  parts.push(
    `You are ${assistant.name}, an AI chat assistant for ${company.name}, a construction company. ` +
      `Your personality is ${assistant.personality}. ` +
      (assistant.instructions ? assistant.instructions : "") +
      ` You are embedded on the company's website helping potential customers. ` +
      `Keep responses concise and friendly. ` +
      `If the visitor seems interested in a service, encourage them to leave their name and phone number so the team can follow up. ` +
      `After capturing the visitor's contact info and understanding their needs, let them know they can schedule a free site visit directly through the chat. ` +
      `A booking option will appear automatically in the chat — mention it naturally when appropriate.`
  );

  if (trainingEntries.length > 0) {
    const grouped: Record<string, typeof trainingEntries> = {};
    for (const entry of trainingEntries) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }

    const categoryLabels: Record<string, string> = {
      service: "Services Offered",
      faq: "Frequently Asked Questions",
      area: "Service Area",
      hours: "Business Hours",
      upsell: "Upsells & Add-ons",
    };

    parts.push("\n\n## Business Knowledge\n");
    for (const [cat, entries] of Object.entries(grouped)) {
      parts.push(`### ${categoryLabels[cat] ?? cat}`);
      for (const e of entries) {
        parts.push(`Q: ${e.question}\nA: ${e.answer}`);
      }
    }
  }

  return parts.join("\n");
}

// ─── Lookup company by widget key ─────────────────────────────────────────────
async function getCompanyByKey(key: string) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.widgetKey, key))
    .limit(1);
  return company ?? null;
}

// ─── GET /widget.js ───────────────────────────────────────────────────────────
router.get("/widget.js", async (req, res): Promise<void> => {
  const key = req.query.key as string | undefined;
  if (!key) {
    res.status(400).send("// Missing key parameter");
    return;
  }

  const company = await getCompanyByKey(key);
  if (!company) {
    res.status(404).send("// Invalid widget key");
    return;
  }

  const script = buildWidgetScript();

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(script);
});

// ─── GET /widget/config ───────────────────────────────────────────────────────
router.get("/widget/config", async (req, res): Promise<void> => {
  const key = req.query.key as string | undefined;
  if (!key) {
    res.status(400).json({ error: "Missing key" });
    return;
  }

  const company = await getCompanyByKey(key);
  if (!company) {
    res.status(404).json({ error: "Invalid widget key" });
    return;
  }

  res.json({
    companyName: company.name,
    color: company.widgetColor ?? "#36C6D5",
    greeting: company.widgetGreeting ?? "Hi! How can I help you today?",
  });
});

// ─── POST /widget/chat ────────────────────────────────────────────────────────
router.post("/widget/chat", async (req, res): Promise<void> => {
  const { key, sessionId, message, visitorName, visitorPhone } = req.body as {
    key?: string;
    sessionId?: string;
    message?: string;
    visitorName?: string;
    visitorPhone?: string;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!key || typeof key !== "string" || key.length > 128) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 128) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  const trimmedMessage = message.slice(0, MAX_MESSAGE_LENGTH);

  // ── Rate limit ─────────────────────────────────────────────────────────────
  if (!checkRateLimit(key)) {
    res.status(429).json({ error: "Too many requests. Please wait a moment before sending another message." });
    return;
  }

  // ── Resolve company ────────────────────────────────────────────────────────
  const company = await getCompanyByKey(key);
  if (!company) {
    res.status(404).json({ error: "Invalid widget key" });
    return;
  }

  // ── Get or create session ─────────────────────────────────────────────────
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      companyId: company.id,
      messages: [],
      createdAt: new Date(),
    };
    sessions.set(sessionId, session);
  } else if (session.companyId !== company.id) {
    // Session belongs to a different company — reject to prevent cross-tenant mixing
    res.status(403).json({ error: "Session key mismatch" });
    return;
  }

  // ── Guard against excessively long sessions ───────────────────────────────
  if (session.messages.length >= MAX_SESSION_MESSAGES) {
    res.json({
      reply: "This chat session has reached its limit. Please refresh the page to start a new conversation.",
      sessionId,
    });
    return;
  }

  // ── Update visitor info if freshly provided ───────────────────────────────
  if (visitorName && typeof visitorName === "string" && !session.visitorName) {
    session.visitorName = visitorName.slice(0, 200);
  }
  if (visitorPhone && typeof visitorPhone === "string" && !session.visitorPhone) {
    session.visitorPhone = visitorPhone.slice(0, 50);
  }

  // ── Save lead (once per session, when we have name + phone) ───────────────
  let justSavedLead = false;
  if (!session.savedLeadId && session.visitorName && session.visitorPhone) {
    try {
      const existingContacts = await db
        .select()
        .from(contactsTable)
        .where(eq(contactsTable.phone, session.visitorPhone))
        .limit(1);

      let contactId: number;
      if (existingContacts.length > 0) {
        contactId = existingContacts[0].id;
      } else {
        const [newContact] = await db
          .insert(contactsTable)
          .values({
            name: session.visitorName,
            phone: session.visitorPhone,
            type: "lead",
            notes: "Captured via website chat widget",
          })
          .returning();
        contactId = newContact.id;
      }
      session.savedLeadId = contactId;
      justSavedLead = true;

      const [call] = await db
        .insert(callsTable)
        .values({
          callerName: session.visitorName,
          callerPhone: session.visitorPhone,
          status: "unresolved",
          outcome: "Website chat widget lead",
          duration: 0,
          assistantName: "Website Widget",
          notes: "Started via embedded website chat widget",
          contactId,
          transcript: [],
        })
        .returning();
      session.savedCallId = call.id;
    } catch {
      // Non-fatal — continue even if lead saving fails
    }
  }

  // ── Load active assistant ─────────────────────────────────────────────────
  const assistants = await db
    .select()
    .from(assistantsTable)
    .where(eq(assistantsTable.active, true))
    .orderBy(assistantsTable.createdAt)
    .limit(1);

  const assistant = assistants[0] ?? null;

  let systemPrompt: string;
  if (assistant) {
    const training = await db
      .select()
      .from(assistantTrainingTable)
      .where(eq(assistantTrainingTable.assistantId, assistant.id))
      .orderBy(assistantTrainingTable.createdAt);
    systemPrompt = buildWidgetSystemPrompt(assistant, training, company);
  } else {
    systemPrompt =
      `You are a helpful AI chat assistant for ${company.name}, a construction company. ` +
      `Be concise and friendly. Help answer questions about the business and capture leads.`;
  }

  // ── Add user message ──────────────────────────────────────────────────────
  session.messages.push({ role: "user", content: trimmedMessage });

  // ── Call AI ───────────────────────────────────────────────────────────────
  let reply: string;
  try {
    const historyForAI = session.messages.slice(-20);
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyForAI.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    reply =
      completion.choices[0]?.message?.content ??
      "Sorry, I'm having trouble responding right now. Please call us directly!";
  } catch {
    // Remove the user message we just added so it doesn't corrupt history
    session.messages.pop();
    res.status(502).json({
      error: "AI service unavailable",
      reply: "Sorry, I'm having trouble responding right now. Please try again in a moment or call us directly.",
    });
    return;
  }

  // ── Add assistant reply to history ────────────────────────────────────────
  session.messages.push({ role: "assistant", content: reply });

  // ── Update call transcript ────────────────────────────────────────────────
  if (session.savedCallId) {
    try {
      const { eq: eqFn } = await import("drizzle-orm");
      const transcript = session.messages.map((m, i) => ({
        speaker: m.role === "user" ? "caller" : "assistant",
        text: m.content,
        timestamp: i,
      }));
      await db
        .update(callsTable)
        .set({ transcript })
        .where(eqFn(callsTable.id, session.savedCallId));
    } catch {
      // Non-fatal
    }
  }

  // ── Send lead notification email (fire-and-forget) ────────────────────────
  if (justSavedLead && session.visitorName && session.visitorPhone && company.widgetLeadNotify) {
    const chatLines = session.messages
      .map((m) => `${m.role === "user" ? session.visitorName : "Assistant"}: ${m.content}`)
      .join("\n");
    // Non-blocking — don't await so it doesn't delay the response
    sendWidgetLeadNotification(company, session.visitorName, session.visitorPhone, chatLines).catch(() => {});
  }

  // ── Offer booking once lead is captured and they've had a real chat ──────
  let showBooking = false;
  const assistantTurns = session.messages.filter(m => m.role === "assistant").length;
  if (
    !session.bookingOffered &&
    !session.bookingCompleted &&
    session.savedLeadId !== undefined &&
    assistantTurns >= 2
  ) {
    session.bookingOffered = true;
    showBooking = true;
  }

  res.json({ reply, sessionId, showBooking });
});

// ─── Slot candidate generator (pure, no DB) ──────────────────────────────────
function buildCandidateSlots(): { label: string; iso: string }[] {
  const candidateSlots: { label: string; iso: string }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (candidateSlots.length < 12) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) { // Skip weekends
      for (const hour of [9, 13]) {
        const slot = new Date(cursor);
        slot.setHours(hour, 0, 0, 0);
        const label =
          slot.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" }) +
          " at " + (hour === 9 ? "9:00 AM" : "1:00 PM");
        candidateSlots.push({ label, iso: slot.toISOString() });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return candidateSlots;
}

// ─── Shared slot generation (company-scoped, accepts tx or db) ───────────────
// Accepts any drizzle executor (db or an active transaction) so it runs on
// the correct pooled connection — critical for the locked recheck inside a
// transaction where the prior insert must be visible to the same connection.
async function getAvailableSlots(
  companyId: number,
  executor: Pick<typeof db, "select"> = db
): Promise<{ label: string; iso: string }[]> {
  const candidateSlots = buildCandidateSlots();

  // Fetch existing jobs for this company in the window to exclude conflicts (±2 hours).
  // Jobs with companyId = null (legacy/manually-created) are also blocked for backward
  // compatibility with existing single-tenant installations.
  const windowStart = new Date(candidateSlots[0].iso);
  windowStart.setHours(windowStart.getHours() - 2);
  const windowEnd = new Date(candidateSlots[candidateSlots.length - 1].iso);
  windowEnd.setHours(windowEnd.getHours() + 2);

  const existingJobs = await executor
    .select({ scheduledAt: jobsTable.scheduledAt })
    .from(jobsTable)
    .where(
      and(
        gte(jobsTable.scheduledAt, windowStart),
        lte(jobsTable.scheduledAt, windowEnd),
        or(
          eq(jobsTable.companyId, companyId),
          isNull(jobsTable.companyId)
        )
      )
    );

  const bookedTimes = existingJobs.map(j => j.scheduledAt.getTime());
  return candidateSlots.filter(slot => {
    const t = new Date(slot.iso).getTime();
    return !bookedTimes.some(bt => Math.abs(bt - t) < 2 * 60 * 60 * 1000);
  }).slice(0, 6);
}

// ─── GET /widget/slots ────────────────────────────────────────────────────────
router.get("/widget/slots", async (req, res): Promise<void> => {
  const key = req.query.key as string | undefined;
  if (!key) { res.status(400).json({ error: "Missing key" }); return; }

  const company = await getCompanyByKey(key);
  if (!company) { res.status(404).json({ error: "Invalid widget key" }); return; }

  const slots = await getAvailableSlots(company.id);
  res.json({ slots });
});

// ─── POST /widget/book ────────────────────────────────────────────────────────
router.post("/widget/book", async (req, res): Promise<void> => {
  const { key, sessionId, slotIso, serviceDescription } = req.body as {
    key?: string;
    sessionId?: string;
    slotIso?: string;
    serviceDescription?: string;
  };

  if (!key || typeof key !== "string") { res.status(400).json({ error: "Invalid key" }); return; }
  if (!sessionId || typeof sessionId !== "string") { res.status(400).json({ error: "Invalid sessionId" }); return; }
  if (!slotIso || typeof slotIso !== "string") { res.status(400).json({ error: "slotIso is required" }); return; }

  // ── Rate limit booking requests ────────────────────────────────────────────
  if (!checkRateLimit(`book:${key}`)) {
    res.status(429).json({ error: "Too many requests. Please wait a moment before trying again." });
    return;
  }

  const company = await getCompanyByKey(key);
  if (!company) { res.status(404).json({ error: "Invalid widget key" }); return; }

  const session = sessions.get(sessionId);
  if (!session || session.companyId !== company.id) {
    res.status(403).json({ error: "Session not found or mismatch" });
    return;
  }

  // ── Require a captured lead before booking ────────────────────────────────
  // Visitors must have provided name + phone (savedLeadId set) to prevent spam.
  if (!session.savedLeadId) {
    res.status(403).json({ error: "Please share your contact details in the chat before booking." });
    return;
  }

  if (session.bookingCompleted) {
    res.status(409).json({ error: "Booking already made for this session" });
    return;
  }

  // ── Process-level guard: prevent interleaved async operations on same slot ──
  // This prevents two Node.js async tasks from both passing the advisory-lock
  // acquire before either reaches the DB. The DB advisory lock below then
  // protects against concurrent requests across multiple server instances.
  const lockKey = `slot:${company.id}:${slotIso}`;
  if (bookingInFlight.has(lockKey)) {
    res.status(409).json({
      error: "slot_unavailable",
      message: "That time slot is being booked right now. Please choose another.",
    });
    return;
  }
  bookingInFlight.add(lockKey);

  try {
    // ── Atomic DB-level booking: advisory lock + availability recheck + insert ─
    // pg_advisory_xact_lock(key1 int, key2 int) acquires a session-level
    // exclusive advisory lock scoped to (companyId, slotHash). Competing
    // requests on any server instance will block until the transaction commits
    // or rolls back, making the recheck + insert effectively atomic.
    const slotHash = hashToInt32(slotIso);

    let bookedJob: typeof jobsTable.$inferSelect | null = null;
    let matchedSlotLabel: string | null = null;

    await db.transaction(async (tx) => {
      // Acquire company+slot-scoped advisory lock for this transaction
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${company.id}, ${slotHash})`
      );

      // Re-fetch availability through tx (same connection, same snapshot) —
      // detects conflicts from jobs inserted since the widget last fetched slots,
      // and crucially sees rows inserted by concurrent requests that committed
      // before the advisory lock was acquired by this transaction.
      const available = await getAvailableSlots(company.id, tx);
      const matchedSlot = available.find(s => s.iso === slotIso);
      if (!matchedSlot) {
        // Throw to roll back transaction and release the lock
        throw Object.assign(new Error("slot_unavailable"), { slotUnavailable: true });
      }
      matchedSlotLabel = matchedSlot.label;

      const scheduledAt = new Date(slotIso);
      const contactName = session.visitorName ?? "Website Visitor";
      const contactPhone = session.visitorPhone ?? "";

      const [job] = await tx
        .insert(jobsTable)
        .values({
          title: `Site Visit – ${contactName}`,
          description: serviceDescription
            ? `Booked via website chat widget.\n\nVisitor request: ${serviceDescription}`
            : "Booked via website chat widget.",
          status: "pending_confirmation",
          scheduledAt,
          estimatedDuration: 60,
          contactName,
          contactPhone,
          contactId: session.savedLeadId ?? null,
          companyId: company.id,
          serviceType: "Site Visit",
          notes: "Widget booking — awaiting contractor confirmation.",
        })
        .returning();
      bookedJob = job;
    });

    session.bookingCompleted = true;
    session.bookedJobId = bookedJob!.id;

    res.json({
      jobId: bookedJob!.id,
      confirmedLabel: matchedSlotLabel!,
      message: `✅ Your site visit has been requested for ${matchedSlotLabel}. We'll confirm shortly — see you then!`,
    });
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { slotUnavailable?: boolean }).slotUnavailable) {
      res.status(409).json({
        error: "slot_unavailable",
        message: "That time slot is no longer available. Please choose another.",
      });
    } else {
      logger.error({ err }, "Widget booking failed");
      res.status(500).json({ error: "Booking failed. Please try again." });
    }
  } finally {
    bookingInFlight.delete(lockKey);
  }
});

// ─── Widget script builder ────────────────────────────────────────────────────
function buildWidgetScript(): string {
  return `
(function () {
  "use strict";

  // Read key from this <script> tag's data-key attribute
  var scripts = document.querySelectorAll("script[data-buildai-key]");
  var scriptEl = scripts[scripts.length - 1];
  if (!scriptEl) {
    // Fallback: try currentScript
    scriptEl = document.currentScript;
  }
  var key = scriptEl && (scriptEl.getAttribute("data-buildai-key") || scriptEl.getAttribute("data-key"));
  if (!key) {
    console.warn("[CREWON Widget] No data-buildai-key attribute found on script tag.");
    return;
  }

  // Derive API base from the script src
  var src = scriptEl.getAttribute("src") || "";
  var apiBase = src.replace(/\\/widget\\.js.*$/, "");

  var COLORS = { primary: "#36C6D5" };
  var config = { companyName: "Us", color: COLORS.primary, greeting: "Hi! How can I help you today?" };
  var sessionId = (function () {
    var key2 = "bai_sid_" + key;
    var sid = sessionStorage.getItem(key2);
    if (!sid) { sid = "sid_" + Math.random().toString(36).slice(2) + Date.now(); sessionStorage.setItem(key2, sid); }
    return sid;
  })();

  // ── Styles ────────────────────────────────────────────────────────────────
  var style = document.createElement("style");
  style.textContent = [
    "#bai-widget-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:2147483646;transition:transform .2s;}",
    "#bai-widget-btn:hover{transform:scale(1.08);}",
    "#bai-widget-panel{position:fixed;bottom:92px;right:24px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 110px);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;z-index:2147483645;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;transition:opacity .2s,transform .2s;}",
    "#bai-widget-panel.bai-hidden{opacity:0;pointer-events:none;transform:translateY(12px);}",
    "#bai-header{padding:16px;display:flex;align-items:center;justify-content:space-between;color:#fff;}",
    "#bai-header-info{display:flex;align-items:center;gap:10px;}",
    "#bai-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;}",
    "#bai-company-name{font-weight:600;font-size:15px;}",
    "#bai-status{font-size:12px;opacity:.8;}",
    "#bai-close-btn{background:none;border:none;cursor:pointer;color:#fff;opacity:.8;font-size:20px;line-height:1;padding:4px;}",
    "#bai-close-btn:hover{opacity:1;}",
    "#bai-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#f9fafb;}",
    ".bai-msg{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-break:break-word;}",
    ".bai-msg-bot{align-self:flex-start;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);border-bottom-left-radius:4px;color:#1f2937;}",
    ".bai-msg-user{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;}",
    ".bai-typing{align-self:flex-start;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);border-radius:12px;border-bottom-left-radius:4px;padding:10px 14px;display:flex;gap:4px;align-items:center;}",
    ".bai-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bai-bounce 1.2s infinite;}",
    ".bai-dot:nth-child(2){animation-delay:.2s;}.bai-dot:nth-child(3){animation-delay:.4s;}",
    "@keyframes bai-bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}}",
    "#bai-lead-form{padding:16px;background:#fff;border-top:1px solid #e5e7eb;}",
    "#bai-lead-form p{font-size:13px;color:#6b7280;margin:0 0 10px;}",
    "#bai-lead-form input{width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:8px;outline:none;}",
    "#bai-lead-form input:focus{border-color:var(--bai-primary);}",
    "#bai-lead-form-btns{display:flex;gap:8px;}",
    "#bai-lead-skip{flex:1;padding:8px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#6b7280;}",
    "#bai-lead-submit{flex:2;padding:8px;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;}",
    "#bai-booking-panel{padding:14px 16px;background:#fff;border-top:1px solid #e5e7eb;}",
    "#bai-booking-panel.bai-hidden{display:none;}",
    "#bai-booking-panel h4{font-size:13px;font-weight:600;color:#111827;margin:0 0 4px;}",
    "#bai-booking-panel p{font-size:12px;color:#6b7280;margin:0 0 10px;}",
    "#bai-slots-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;}",
    ".bai-slot-btn{padding:7px 8px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;text-align:center;line-height:1.3;transition:background .15s,border-color .15s,color .15s;}",
    ".bai-slot-btn:hover{border-color:var(--bai-primary);color:var(--bai-primary);}",
    ".bai-slot-btn:disabled{opacity:.5;cursor:default;}",
    "#bai-slots-loading{font-size:12px;color:#9ca3af;padding:8px 0;text-align:center;}",
    "#bai-booking-dismiss{display:block;width:100%;padding:6px;border:none;background:none;cursor:pointer;font-size:12px;color:#9ca3af;text-align:center;}",
    "#bai-booking-dismiss:hover{color:#6b7280;}",
    "#bai-input-row{padding:12px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:8px;}",
    "#bai-input{flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:24px;font-size:14px;outline:none;resize:none;}",
    "#bai-input:focus{border-color:var(--bai-primary);}",
    "#bai-send-btn{width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}",
    "#bai-send-btn:disabled{opacity:.5;cursor:default;}",
    "#bai-powered{text-align:center;font-size:11px;color:#9ca3af;padding:6px 0;background:#fff;}",
    "#bai-powered a{color:#9ca3af;text-decoration:none;}",
  ].join("");
  document.head.appendChild(style);

  // ── DOM ───────────────────────────────────────────────────────────────────
  var btn = document.createElement("button");
  btn.id = "bai-widget-btn";
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.style.color = "#fff";

  var panel = document.createElement("div");
  panel.id = "bai-widget-panel";
  panel.classList.add("bai-hidden");
  panel.innerHTML = [
    '<div id="bai-header">',
    '  <div id="bai-header-info">',
    '    <div id="bai-avatar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>',
    '    <div><div id="bai-company-name">Chat</div><div id="bai-status">● Online</div></div>',
    '  </div>',
    '  <button id="bai-close-btn" aria-label="Close chat">&times;</button>',
    "</div>",
    '<div id="bai-messages"></div>',
    '<div id="bai-lead-form">',
    '  <p>Before we start, could you share your name and phone number?</p>',
    '  <input id="bai-lead-name" type="text" placeholder="Your name" autocomplete="name"/>',
    '  <input id="bai-lead-phone" type="tel" placeholder="Your phone number" autocomplete="tel"/>',
    '  <div id="bai-lead-form-btns">',
    '    <button id="bai-lead-skip">Skip</button>',
    '    <button id="bai-lead-submit">Start chatting</button>',
    '  </div>',
    "</div>",
    '<div id="bai-booking-panel" class="bai-hidden">',
    '  <h4>📅 Schedule a free site visit</h4>',
    '  <p>Pick a time and we\'ll confirm it shortly.</p>',
    '  <div id="bai-slots-grid"><div id="bai-slots-loading">Loading available times…</div></div>',
    '  <button id="bai-booking-dismiss">No thanks, I\'ll wait for a call</button>',
    '</div>',
    '<div id="bai-input-row" style="display:none">',
    '  <input id="bai-input" type="text" placeholder="Type a message…" autocomplete="off"/>',
    '  <button id="bai-send-btn" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>',
    "</div>",
    '<div id="bai-powered"><a href="https://buildai.app" target="_blank" rel="noopener">Powered by CREWON</a></div>',
  ].join("");

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // ── Apply colours ─────────────────────────────────────────────────────────
  function applyColor(color) {
    document.documentElement.style.setProperty("--bai-primary", color);
    btn.style.background = color;
    panel.querySelector("#bai-header").style.background = color;
    panel.querySelector("#bai-lead-submit").style.background = color;
    panel.querySelector("#bai-send-btn").style.background = color;
    panel.querySelectorAll(".bai-msg-user").forEach(function (el) { el.style.background = color; });
  }

  // ── Fetch config ──────────────────────────────────────────────────────────
  fetch(apiBase + "/widget/config?key=" + encodeURIComponent(key))
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      config = cfg;
      applyColor(cfg.color || COLORS.primary);
      panel.querySelector("#bai-company-name").textContent = cfg.companyName || "Chat";
      // Show greeting
      appendBotMessage(cfg.greeting || "Hi! How can I help you today?");
    })
    .catch(function () { applyColor(COLORS.primary); appendBotMessage("Hi! How can I help you today?"); });

  // ── Message helpers ───────────────────────────────────────────────────────
  var messagesEl = panel.querySelector("#bai-messages");
  function appendBotMessage(text) {
    var d = document.createElement("div");
    d.className = "bai-msg bai-msg-bot";
    d.textContent = text;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return d;
  }
  function appendUserMessage(text) {
    var d = document.createElement("div");
    d.className = "bai-msg bai-msg-user";
    d.style.background = config.color || COLORS.primary;
    d.textContent = text;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function showTyping() {
    var d = document.createElement("div");
    d.className = "bai-typing";
    d.innerHTML = '<span class="bai-dot"></span><span class="bai-dot"></span><span class="bai-dot"></span>';
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return d;
  }

  // ── Lead form ─────────────────────────────────────────────────────────────
  var visitorName = "";
  var visitorPhone = "";
  var leadForm = panel.querySelector("#bai-lead-form");
  var inputRow = panel.querySelector("#bai-input-row");
  var nameInput = panel.querySelector("#bai-lead-name");
  var phoneInput = panel.querySelector("#bai-lead-phone");

  function startChat() {
    leadForm.style.display = "none";
    inputRow.style.display = "flex";
    panel.querySelector("#bai-input").focus();
  }

  panel.querySelector("#bai-lead-submit").addEventListener("click", function () {
    visitorName = nameInput.value.trim();
    visitorPhone = phoneInput.value.trim();
    startChat();
  });
  panel.querySelector("#bai-lead-skip").addEventListener("click", function () {
    startChat();
  });
  nameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") phoneInput.focus(); });
  phoneInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { visitorName = nameInput.value.trim(); visitorPhone = phoneInput.value.trim(); startChat(); } });

  // ── Booking panel ─────────────────────────────────────────────────────────
  var bookingPanel = panel.querySelector("#bai-booking-panel");
  var slotsGrid = panel.querySelector("#bai-slots-grid");
  var bookingDismiss = panel.querySelector("#bai-booking-dismiss");
  var bookingShown = false;

  function hideBookingPanel() {
    bookingPanel.classList.add("bai-hidden");
  }

  bookingDismiss.addEventListener("click", function () {
    hideBookingPanel();
    appendBotMessage("No problem! We\\'ll give you a call soon. Is there anything else I can help with?");
  });

  function showBookingPanel() {
    if (bookingShown) return;
    bookingShown = true;

    // Swap to show booking above input (hide input temporarily)
    bookingPanel.classList.remove("bai-hidden");

    // Load slots
    fetch(apiBase + "/widget/slots?key=" + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        slotsGrid.innerHTML = "";
        var slots = (data && data.slots) ? data.slots : [];
        if (slots.length === 0) {
          slotsGrid.innerHTML = '<p style="font-size:12px;color:#9ca3af;grid-column:1/-1;text-align:center;padding:6px 0">No slots available right now — we\\'ll call you soon.</p>';
          return;
        }
        slots.forEach(function (slot) {
          var slotBtn = document.createElement("button");
          slotBtn.className = "bai-slot-btn";
          slotBtn.textContent = slot.label;
          slotBtn.addEventListener("click", function () {
            bookSlot(slot.iso, slot.label);
          });
          slotsGrid.appendChild(slotBtn);
        });
      })
      .catch(function () {
        slotsGrid.innerHTML = '<p style="font-size:12px;color:#9ca3af;grid-column:1/-1;text-align:center;padding:6px 0">Couldn\\'t load times — we\\'ll call you to arrange a visit.</p>';
      });
  }

  function bookSlot(iso, label) {
    // Disable all slot buttons while booking
    slotsGrid.querySelectorAll(".bai-slot-btn").forEach(function (b) { b.disabled = true; });
    slotsGrid.innerHTML = '<div id="bai-slots-loading">Confirming your booking…</div>';

    fetch(apiBase + "/widget/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, sessionId: sessionId, slotIso: iso }),
    })
      .then(function (r) { return r.json().then(function(d) { return { ok: r.ok, data: d, status: r.status }; }); })
      .then(function (result) {
        if (result.status === 409 && result.data && result.data.error === "slot_unavailable") {
          // Slot was taken — reload available slots and let visitor pick again
          slotsGrid.innerHTML = '<div id="bai-slots-loading" style="color:#dc2626;">That slot was just taken. Here are the next available times:</div>';
          setTimeout(function() { reloadSlots(); }, 800);
        } else if (!result.ok) {
          hideBookingPanel();
          appendBotMessage("Sorry, we couldn\\'t complete your booking. Please call us to arrange a visit.");
        } else {
          hideBookingPanel();
          appendBotMessage(result.data.message || ("✅ Site visit booked for " + label + ". We\\'ll confirm shortly!"));
        }
      })
      .catch(function () {
        hideBookingPanel();
        appendBotMessage("Sorry, there was a connection error. Please call us to arrange a visit.");
      });
  }

  function reloadSlots() {
    fetch(apiBase + "/widget/slots?key=" + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        slotsGrid.innerHTML = "";
        var slots = (data && data.slots) ? data.slots : [];
        if (slots.length === 0) {
          slotsGrid.innerHTML = '<p style="font-size:12px;color:#9ca3af;grid-column:1/-1;text-align:center;padding:6px 0">No slots available right now — we\\'ll call you soon.</p>';
          return;
        }
        slots.forEach(function (slot) {
          var slotBtn = document.createElement("button");
          slotBtn.className = "bai-slot-btn";
          slotBtn.textContent = slot.label;
          slotBtn.addEventListener("click", function () { bookSlot(slot.iso, slot.label); });
          slotsGrid.appendChild(slotBtn);
        });
      })
      .catch(function () {
        slotsGrid.innerHTML = '<p style="font-size:12px;color:#9ca3af;grid-column:1/-1;text-align:center;padding:6px 0">Couldn\\'t load times — we\\'ll call you to arrange a visit.</p>';
      });
  }

  // ── Send message ──────────────────────────────────────────────────────────
  var isSending = false;
  function sendMessage() {
    var input = panel.querySelector("#bai-input");
    var text = input.value.trim();
    if (!text || isSending) return;
    isSending = true;
    input.value = "";
    panel.querySelector("#bai-send-btn").disabled = true;
    appendUserMessage(text);
    var typing = showTyping();
    var body = { key: key, sessionId: sessionId, message: text };
    if (visitorName) body.visitorName = visitorName;
    if (visitorPhone) body.visitorPhone = visitorPhone;
    fetch(apiBase + "/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing.remove();
        appendBotMessage(data.reply || data.error || "Sorry, I couldn\\'t process that.");
        if (data.showBooking) {
          showBookingPanel();
        }
      })
      .catch(function () {
        typing.remove();
        appendBotMessage("Sorry, there was a connection error. Please try again.");
      })
      .finally(function () {
        isSending = false;
        panel.querySelector("#bai-send-btn").disabled = false;
        panel.querySelector("#bai-input").focus();
      });
  }

  panel.querySelector("#bai-send-btn").addEventListener("click", sendMessage);
  panel.querySelector("#bai-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // ── Toggle panel ──────────────────────────────────────────────────────────
  btn.addEventListener("click", function () {
    panel.classList.toggle("bai-hidden");
  });
  panel.querySelector("#bai-close-btn").addEventListener("click", function () {
    panel.classList.add("bai-hidden");
  });
})();
`.trim();
}

export default router;

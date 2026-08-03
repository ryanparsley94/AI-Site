import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  companiesTable,
  assistantsTable,
  assistantTrainingTable,
  contactsTable,
  callsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

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
      `If the visitor seems interested in a service, encourage them to leave their name and phone number so the team can follow up.`
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
    color: company.widgetColor ?? "#f97316",
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

  res.json({ reply, sessionId });
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
    console.warn("[BuildAI Widget] No data-buildai-key attribute found on script tag.");
    return;
  }

  // Derive API base from the script src
  var src = scriptEl.getAttribute("src") || "";
  var apiBase = src.replace(/\\/widget\\.js.*$/, "");

  var COLORS = { primary: "#f97316" };
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
    '<div id="bai-input-row" style="display:none">',
    '  <input id="bai-input" type="text" placeholder="Type a message…" autocomplete="off"/>',
    '  <button id="bai-send-btn" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>',
    "</div>",
    '<div id="bai-powered"><a href="https://buildai.app" target="_blank" rel="noopener">Powered by BuildAI</a></div>',
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
        appendBotMessage(data.reply || data.error || "Sorry, I couldn't process that.");
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

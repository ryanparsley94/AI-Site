import type { Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { finish } from "../routes/voice";

type Turn = { role: "user" | "assistant"; text: string; timestamp: string };
const voices = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function extractAndFinish(callSid: string, turns: Turn[]) {
  try {
    const transcript = turns.map(t => `${t.role}: ${t.text}`).join("\n").slice(0, 18000);
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 1200,
      reasoning_effort: "none",
      messages: [{ role: "system", content: "Extract only details explicitly stated by the caller in this phone transcript. Return null for unknown values; never infer a name, number, address, urgency or availability." }, { role: "user", content: transcript }],
      tools: [{
        type: "function",
        function: {
          name: "capture_enquiry",
          description: "Capture clearly stated caller and job details.",
          strict: true,
          parameters: {
            type: "object", additionalProperties: false,
            required: ["name", "phone", "work", "address", "urgency", "availability"],
            properties: Object.fromEntries(["name", "phone", "work", "address", "urgency", "availability"].map(k => [k, { type: ["string", "null"] }])),
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "capture_enquiry" } },
    });
    const args = response.choices[0]?.message.tool_calls?.[0];
    const details = args?.type === "function" ? JSON.parse(args.function.arguments) as Record<string, unknown> : {};
    const row = await pool.query<{ answers: Record<string, unknown> }>("SELECT answers FROM voice_call_sessions WHERE call_sid=$1", [callSid]);
    const prior = row.rows[0]?.answers ?? {};
    for (const key of ["name", "phone", "work", "address", "urgency", "availability"]) {
      if (typeof details[key] === "string" && details[key]) prior[key] = String(details[key]).slice(0, 300);
    }
    await pool.query("UPDATE voice_call_sessions SET answers=$2::jsonb WHERE call_sid=$1", [callSid, JSON.stringify(prior)]);
  } catch (error) {
    logger.warn({ err: error, callSid }, "Post-call enquiry extraction unavailable; transcript retained");
  }
  await finish(callSid);
}

export function attachRealtimeVoice(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/voice/stream") return;
    wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
  });

  wss.on("connection", twilio => {
    let upstream: WebSocket | undefined;
    let callSid = "";
    let streamSid = "";
    let started = false;
    let closed = false;
    let turns: Turn[] = [];
    let persistChain = Promise.resolve();
    const persistTranscript = () => {
      const snapshot = [...turns];
      persistChain = persistChain.then(async () => {
        const row = await pool.query<{ answers: Record<string, unknown> }>("SELECT answers FROM voice_call_sessions WHERE call_sid=$1", [callSid]);
        if (!row.rows[0]) return;
        const answers = { ...row.rows[0].answers, _conversation: snapshot };
        await pool.query("UPDATE voice_call_sessions SET answers=$2::jsonb,updated_at=now() WHERE call_sid=$1", [callSid, JSON.stringify(answers)]);
      }).catch(error => logger.warn({ err: error, callSid }, "Realtime transcript checkpoint failed"));
    };
    const endCall = async () => {
      if (closed || !callSid) return;
      closed = true;
      await persistChain;
      await extractAndFinish(callSid, turns);
    };

    twilio.on("message", async raw => {
      let message: Record<string, any>;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.event === "start") {
        callSid = String(message.start?.callSid ?? "");
        streamSid = String(message.start?.streamSid ?? "");
        const auth = String(message.start?.customParameters?.auth ?? "");
        const providedSid = String(message.start?.customParameters?.callSid ?? "");
        const expected = process.env.TWILIO_AUTH_TOKEN && callSid
          ? createHmac("sha256", process.env.TWILIO_AUTH_TOKEN).update(callSid).digest("hex") : "";
        if (!/^CA[a-fA-F0-9]{32}$/.test(callSid) || providedSid !== callSid || !expected || !safeEqual(auth, expected)) {
          twilio.close(1008, "unauthorized"); return;
        }
        if (!process.env.OPENAI_API_KEY) { twilio.close(1011, "voice service not configured"); return; }
        const result = await pool.query<Record<string, any>>("SELECT * FROM voice_call_sessions WHERE call_sid=$1", [callSid]);
        const session = result.rows[0];
        if (!session) { twilio.close(1008, "call session missing"); return; }
        const voice = voices.has(session.realtime_voice) ? session.realtime_voice : "marin";
        const business = String(session.company_name || "Parsley Electrical");
        const agent = String(session.voice_agent_name || "").trim();
        const greeting = session.bot_greeting?.trim() || `Hello, you've reached ${business}.${agent ? ` This is ${agent}.` : ""} How can I help?`;
        const knowledge = session.assistant_id
          ? await pool.query<{ category: string; question: string; answer: string }>(
              "SELECT category,question,answer FROM assistant_training WHERE assistant_id=$1 ORDER BY id LIMIT 60",
              [session.assistant_id],
            )
          : { rows: [] as { category: string; question: string; answer: string }[] };
        const knowledgeText = knowledge.rows.map(entry => `[${entry.category}] ${entry.question}: ${entry.answer}`).join("\n").slice(0, 8000);
        const instructions = `You are ${agent || "the receptionist"}, a helpful human-style receptionist for ${business}. Start by saying exactly: "${greeting}" Do not repeat the greeting. Style: ${session.receptionist_style || "Warm, professional, concise and naturally British where appropriate."}. Business instructions: ${session.bot_instructions || "Take accurate messages and arrange a team follow-up."}. Reviewed business knowledge: ${knowledgeText || "No reviewed knowledge has been added."}. Speak briefly and naturally. Let the caller speak freely, answer questions using only the supplied business instructions and reviewed knowledge, and ask one useful question at a time. Naturally collect full name, callback number, work needed, site address/postcode, urgency and availability. Never invent prices, coverage, appointments or attendance. For immediate danger, advise emergency services and do not promise attendance. If unsure, say the team will confirm. Do not mention CREWON or claim to be human or AI.`;
        upstream = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          handshakeTimeout: 10_000,
        });
        upstream.on("open", () => upstream?.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"], instructions,
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
                turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 550, create_response: true, interrupt_response: true },
              },
              output: { format: { type: "audio/pcmu" }, voice },
            },
          },
        })));
        upstream.on("message", eventRaw => {
          let event: Record<string, any>;
          try { event = JSON.parse(eventRaw.toString()); } catch { return; }
          if (event.type === "session.updated" && !started) {
            started = true;
            upstream?.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
          } else if (event.type === "response.output_audio.delta" && twilio.readyState === WebSocket.OPEN) {
            twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: event.delta } }));
          } else if (event.type === "input_audio_buffer.speech_started") {
            if (twilio.readyState === WebSocket.OPEN) twilio.send(JSON.stringify({ event: "clear", streamSid }));
          } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
            turns.push({ role: "user", text: String(event.transcript).slice(0, 1500), timestamp: new Date().toISOString() });
            persistTranscript();
          } else if (event.type === "response.output_audio_transcript.done" && event.transcript) {
            turns.push({ role: "assistant", text: String(event.transcript).slice(0, 1500), timestamp: new Date().toISOString() });
            persistTranscript();
          } else if (event.type === "error") {
            logger.warn({ code: event.error?.code, callSid }, "OpenAI Realtime event error");
          }
        });
        upstream.on("error", error => logger.error({ err: error, callSid }, "OpenAI Realtime socket failed"));
        upstream.on("close", () => { if (!closed && turns.length) void endCall(); });
      } else if (message.event === "media" && upstream?.readyState === WebSocket.OPEN && started) {
        upstream.send(JSON.stringify({ type: "input_audio_buffer.append", audio: message.media?.payload }));
      } else if (message.event === "stop") {
        void endCall();
        upstream?.close();
      }
    });
    twilio.on("close", () => { void endCall(); upstream?.close(); });
    twilio.on("error", error => logger.warn({ err: error }, "Twilio media stream socket error"));
  });
}

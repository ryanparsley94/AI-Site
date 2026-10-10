import type { Server } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { pool } from "@workspace/db";
import { logger } from "./logger";

type TwilioStart = {
  event: "start";
  streamSid: string;
  start: {
    accountSid: string;
    callSid: string;
    streamSid: string;
    customParameters?: Record<string, string>;
  };
};

type TwilioMedia = {
  event: "media";
  streamSid: string;
  media: { payload: string };
};

type TwilioStop = { event: "stop"; streamSid: string; stop: { callSid: string } };
type TwilioMessage = TwilioStart | TwilioMedia | TwilioStop | { event: string; [key: string]: unknown };

type TranscriptEntry = {
  speaker: "caller" | "assistant";
  text: string;
  timestamp: number;
};

const REALTIME_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar",
]);

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function sendJson(ws: WebSocket, value: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}

function wsPublicUrl(): string | null {
  const base = process.env.VOICE_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.pathname = "/api/voice/media";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function realtimePhoneStreamUrl(): string | null {
  return wsPublicUrl();
}

async function loadCallContext(callSid: string) {
  const sessionResult = await pool.query<{
    call_id: number | null;
    caller_phone: string;
    called_phone: string;
  }>(
    "SELECT call_id, caller_phone, called_phone FROM voice_call_sessions WHERE call_sid=$1 LIMIT 1",
    [callSid],
  );
  const session = sessionResult.rows[0];
  if (!session?.call_id) throw new Error("Voice session not found");

  const companyResult = await pool.query<{
    id: number;
    name: string;
    phone: string;
    email: string | null;
    timezone: string;
  }>("SELECT id,name,phone,email,timezone FROM companies ORDER BY id LIMIT 1");
  const company = companyResult.rows[0];
  if (!company) throw new Error("Company not configured");

  const assistantResult = await pool.query<{
    id: number;
    name: string;
    voice: string;
    personality: string;
    greeting: string;
    instructions: string | null;
  }>(
    "SELECT id,name,voice,personality,greeting,instructions FROM assistants WHERE active=true AND type='phone' ORDER BY created_at LIMIT 1",
  );
  const assistant = assistantResult.rows[0] ?? {
    id: 0,
    name: "CREWON Receptionist",
    voice: "marin",
    personality: "professional",
    greeting: `Thank you for calling ${company.name}. How can I help?`,
    instructions: null,
  };

  const trainingResult = assistant.id
    ? await pool.query<{ category: string; question: string; answer: string }>(
        "SELECT category,question,answer FROM assistant_training WHERE assistant_id=$1 ORDER BY created_at",
        [assistant.id],
      )
    : { rows: [] as { category: string; question: string; answer: string }[] };

  return { session, company, assistant, training: trainingResult.rows };
}

function buildInstructions(context: Awaited<ReturnType<typeof loadCallContext>>): string {
  const knowledge = context.training
    .slice(0, 80)
    .map((x) => `[${x.category}] ${x.question}: ${x.answer}`)
    .join("\n");

  return `You are ${context.assistant.name}, the AI receptionist for ${context.company.name}, a UK trade business.
Speak natural British English. Sound warm, calm, capable and concise. Do not sound like a script and do not give long speeches.
You are an AI receptionist; never claim to be a human. If asked, say you are ${context.company.name}'s AI receptionist.
Do not transfer the call live in V1. Tell the caller the team will get back to them when human input is required.
Never invent prices, quotations, appointment availability, certification details, diagnoses, or promises.
Your job is to understand the caller naturally and make sure the business has enough information to act.
Capture during the conversation: full name, best callback number, work required, site address/postcode, urgency/safety, and preferred availability.
Do not mechanically ask fields that the caller has already provided. Ask one useful follow-up at a time.
If there is immediate danger, fire, smoke, burning, electric shock, exposed live parts or another life-safety risk, prioritise safety and advise the caller to move away/isolate only if safe and contact the appropriate emergency service or network operator where relevant. Do not give risky DIY electrical instructions.
When you have enough information, briefly summarise what you understood and say the team will be in touch.
Configured greeting: ${context.assistant.greeting}
Configured style: ${context.assistant.personality}
Additional business instructions: ${context.assistant.instructions ?? "None"}
Business knowledge:
${knowledge || "No additional training entries are configured."}`;
}

async function persistTranscript(callId: number, transcript: TranscriptEntry[]): Promise<void> {
  try {
    const notes = transcript
      .slice(-10)
      .map((entry) => `${entry.speaker === "caller" ? "Caller" : "Receptionist"}: ${entry.text}`)
      .join("\n")
      .slice(0, 6000);
    await pool.query(
      "UPDATE calls SET transcript=$2::jsonb, notes=$3, updated_at=now() WHERE id=$1",
      [callId, JSON.stringify(transcript), notes || "Realtime call in progress"],
    );
  } catch (error) {
    logger.error({ err: error, callId }, "Realtime transcript persistence failed");
  }
}

export function attachRealtimePhone(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/api/voice/media") return;
    if (!process.env.OPENAI_API_KEY || !process.env.VOICE_STREAM_TOKEN) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (twilioWs) => {
    let realtimeWs: WebSocket | null = null;
    let streamSid = "";
    let callSid = "";
    let callId: number | null = null;
    let transcript: TranscriptEntry[] = [];
    let startedAt = Date.now();
    let closing = false;

    const closeRealtime = (): void => {
      if (!realtimeWs) return;
      if (realtimeWs.readyState === WebSocket.OPEN) realtimeWs.close(1000);
      realtimeWs = null;
    };

    const finalise = async (): Promise<void> => {
      if (closing) return;
      closing = true;
      if (callId) {
        await persistTranscript(callId, transcript);
        const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
        await pool.query(
          "UPDATE calls SET duration=$2, outcome=$3, updated_at=now() WHERE id=$1",
          [callId, duration, transcript.length ? "Realtime phone enquiry — review summary" : "Realtime call ended without transcript"],
        ).catch((error: unknown) => logger.error({ err: error, callId }, "Realtime call finalisation failed"));
      }
      closeRealtime();
    };

    const openRealtime = async (start: TwilioStart): Promise<void> => {
      callSid = start.start.callSid;
      streamSid = start.start.streamSid || start.streamSid;
      startedAt = Date.now();

      const expectedAccount = process.env.TWILIO_ACCOUNT_SID;
      if (expectedAccount && start.start.accountSid !== expectedAccount) throw new Error("Unexpected Twilio account");

      const suppliedToken = start.start.customParameters?.streamToken ?? "";
      const expectedToken = process.env.VOICE_STREAM_TOKEN ?? "";
      if (!suppliedToken || !expectedToken || !safeEqual(suppliedToken, expectedToken)) throw new Error("Invalid stream token");

      const context = await loadCallContext(callSid);
      callId = context.session.call_id;
      const requestedVoice = context.assistant.voice.toLowerCase();
      const voice = REALTIME_VOICES.has(requestedVoice) ? requestedVoice : "marin";
      const safetyId = createHash("sha256").update(callSid).digest("hex");

      realtimeWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier": safetyId,
        },
      });

      realtimeWs.on("open", () => {
        if (!realtimeWs) return;
        sendJson(realtimeWs, {
          type: "session.update",
          session: {
            type: "realtime",
            instructions: buildInstructions(context),
            output_modalities: ["audio"],
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "gpt-4o-mini-transcribe" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 350,
                  create_response: true,
                  interrupt_response: true,
                  idle_timeout_ms: 12000,
                },
              },
              output: {
                format: { type: "audio/pcmu" },
                voice,
                speed: 1.05,
              },
            },
          },
        });

        sendJson(realtimeWs, {
          type: "response.create",
          response: {
            instructions: `Open the phone call naturally with this greeting, then wait for the caller: "${context.assistant.greeting}"`,
          },
        });
      });

      realtimeWs.on("message", (raw: RawData) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = typeof event.type === "string" ? event.type : "";

        if (type === "response.output_audio.delta") {
          const delta = typeof event.delta === "string" ? event.delta : "";
          if (delta && streamSid) {
            sendJson(twilioWs, { event: "media", streamSid, media: { payload: delta } });
          }
          return;
        }

        if (type === "input_audio_buffer.speech_started") {
          if (streamSid) sendJson(twilioWs, { event: "clear", streamSid });
          return;
        }

        if (type === "conversation.item.input_audio_transcription.completed") {
          const text = typeof event.transcript === "string" ? event.transcript.trim() : "";
          if (text) {
            transcript.push({ speaker: "caller", text, timestamp: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) });
            if (callId) void persistTranscript(callId, transcript);
          }
          return;
        }

        if (type === "response.output_audio_transcript.done") {
          const text = typeof event.transcript === "string" ? event.transcript.trim() : "";
          if (text) {
            transcript.push({ speaker: "assistant", text, timestamp: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) });
            if (callId) void persistTranscript(callId, transcript);
          }
          return;
        }

        if (type === "error") {
          logger.warn({ callSid, event }, "OpenAI Realtime event error");
        }
      });

      realtimeWs.on("error", (error) => {
        logger.error({ err: error, callSid }, "OpenAI Realtime WebSocket failed");
      });

      realtimeWs.on("close", () => {
        realtimeWs = null;
      });
    };

    twilioWs.on("message", (raw: RawData) => {
      let message: TwilioMessage;
      try {
        message = JSON.parse(raw.toString()) as TwilioMessage;
      } catch {
        return;
      }

      if (message.event === "start") {
        void openRealtime(message as TwilioStart).catch((error: unknown) => {
          logger.error({ err: error }, "Realtime phone stream rejected");
          twilioWs.close(1008, "Stream rejected");
        });
        return;
      }

      if (message.event === "media") {
        const media = message as TwilioMedia;
        if (realtimeWs?.readyState === WebSocket.OPEN && media.media?.payload) {
          sendJson(realtimeWs, { type: "input_audio_buffer.append", audio: media.media.payload });
        }
        return;
      }

      if (message.event === "stop") {
        void finalise();
      }
    });

    twilioWs.on("close", () => { void finalise(); });
    twilioWs.on("error", (error) => {
      logger.error({ err: error, callSid }, "Twilio Media Stream failed");
      void finalise();
    });
  });
}

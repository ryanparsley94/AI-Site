import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { validTwilioWebSocketRequest } from "./voice-security";

type TranscriptEntry = {
  speaker: "caller" | "assistant";
  text: string;
  timestamp: number;
};

type TwilioMessage =
  | { event: "connected" }
  | {
      event: "start";
      streamSid: string;
      start: {
        callSid: string;
        accountSid?: string;
        streamSid?: string;
        customParameters?: Record<string, string>;
      };
    }
  | { event: "media"; streamSid: string; media: { payload: string; track?: string } }
  | { event: "mark"; streamSid: string; mark?: { name?: string } }
  | { event: "dtmf"; streamSid: string; dtmf?: { digit?: string } }
  | { event: "stop"; streamSid: string; stop?: { callSid?: string } };

type AssistantContext = {
  companyId: number;
  companyName: string;
  companyPhone: string;
  companyEmail: string | null;
  assistantId: number;
  assistantName: string;
  voice: string;
  personality: string;
  greeting: string;
  instructions: string | null;
  training: Array<{ category: string; question: string; answer: string }>;
};

const REALTIME_PATH = "/api/voice/media";
const MAX_PENDING_AUDIO = 250;

function toInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function realtimeVoice(value: string): string {
  // Preserve older saved selections while moving to voices supported by Realtime.
  const aliases: Record<string, string> = {
    alloy: "alloy",
    ash: "ash",
    ballad: "ballad",
    coral: "coral",
    echo: "echo",
    sage: "sage",
    shimmer: "shimmer",
    verse: "verse",
    marin: "marin",
    cedar: "cedar",
    fable: "sage",
    nova: "coral",
    onyx: "echo",
  };
  return aliases[value.toLowerCase()] ?? "marin";
}

async function loadContext(companyId: number, assistantId: number): Promise<AssistantContext> {
  const company = await pool.query<{
    id: number;
    name: string;
    phone: string;
    email: string | null;
  }>("SELECT id,name,phone,email FROM companies WHERE id=$1 LIMIT 1", [companyId]);
  if (!company.rows[0]) throw new Error("Company not found");

  const assistant = await pool.query<{
    id: number;
    name: string;
    voice: string;
    personality: string;
    greeting: string;
    instructions: string | null;
  }>(
    `SELECT id,name,voice,personality,greeting,instructions
       FROM assistants
      WHERE id=$1 AND active=true AND type='phone'
        AND (company_id=$2 OR company_id IS NULL)
      LIMIT 1`,
    [assistantId, companyId],
  );
  if (!assistant.rows[0]) throw new Error("Phone assistant not found");

  const training = await pool.query<{ category: string; question: string; answer: string }>(
    "SELECT category,question,answer FROM assistant_training WHERE assistant_id=$1 ORDER BY created_at",
    [assistantId],
  );

  return {
    companyId,
    companyName: company.rows[0].name,
    companyPhone: company.rows[0].phone,
    companyEmail: company.rows[0].email,
    assistantId,
    assistantName: assistant.rows[0].name,
    voice: realtimeVoice(assistant.rows[0].voice),
    personality: assistant.rows[0].personality,
    greeting: assistant.rows[0].greeting,
    instructions: assistant.rows[0].instructions,
    training: training.rows,
  };
}

function buildInstructions(ctx: AssistantContext): string {
  const knowledge = ctx.training.length
    ? ctx.training
        .slice(0, 100)
        .map((entry) => `[${entry.category}] ${entry.question}: ${entry.answer}`)
        .join("\n")
    : "No additional business knowledge has been configured.";

  return `You are ${ctx.assistantName}, the virtual receptionist for ${ctx.companyName}, a UK trade business.

VOICE AND CONVERSATION
- Speak in natural British English with a warm, capable, concise receptionist style.
- Sound conversational, not scripted. Keep turns short and do not repeat information unnecessarily.
- Respond promptly after the caller finishes, but do not talk over them.
- The caller may interrupt you. Stop speaking immediately and listen.
- Never transfer the call to the owner or another person. The business owner may be on site or on the tools and calls must not be forwarded.
- If asked whether you are AI, answer truthfully that you are the business's virtual receptionist.

PRIMARY JOB
1. Understand why the caller is calling.
2. Answer routine questions only when the answer is present in the business details or Business Knowledge.
3. Capture enough information for the team to act without calling the customer back just to ask basic questions.
4. Naturally gather the caller's full name, best callback number, job address/postcode when relevant, description of the work/problem, urgency or safety details, and preferred availability.
5. If the caller asks to book, collect the requested day/time and explain that the team will confirm it unless the system explicitly confirms a slot.
6. If you cannot resolve something, say you will pass the details to the team. Do not invent an answer, price, availability, accreditation, service, diagnosis, or promise.

SAFETY
- If there is immediate danger, fire, electric shock, smell of gas, or another emergency, prioritise safety and tell the caller to contact the appropriate emergency service/provider.
- Never give risky DIY electrical, gas, structural or other hazardous instructions.

BUSINESS DETAILS
Company: ${ctx.companyName}
Main number: ${ctx.companyPhone || "not configured"}
Email: ${ctx.companyEmail || "not configured"}
Receptionist personality: ${ctx.personality}
Additional instructions: ${ctx.instructions || "None"}

BUSINESS KNOWLEDGE
${knowledge}

CALL ENDING
Before ending, briefly confirm the important details you captured and what will happen next. Never promise that a human will call at an exact time unless that has been explicitly confirmed.`;
}

function isOpen(ws: WebSocket | null): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

function safeJson(raw: RawData): unknown {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

export function realtimePhoneStreamUrl(): string | null {
  const base = process.env.VOICE_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.pathname = REALTIME_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function attachRealtimePhone(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "/", "https://internal.invalid").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== REALTIME_PATH) return;

    if (!validTwilioWebSocketRequest(req)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (twilio) => {
    let openai: WebSocket | null = null;
    let streamSid = "";
    let callSid = "";
    let callId: number | null = null;
    let companyId: number | null = null;
    let assistantId: number | null = null;
    let startedAt = Date.now();
    let openaiReady = false;
    let finalised = false;
    let pendingAudio: string[] = [];
    const transcript: TranscriptEntry[] = [];
    let persistChain: Promise<void> = Promise.resolve();

    const queuePersist = () => {
      if (!callId) return;
      const snapshot = JSON.stringify(transcript);
      persistChain = persistChain
        .then(async () => {
          await pool.query(
            "UPDATE calls SET transcript=$2::jsonb,updated_at=now() WHERE id=$1",
            [callId, snapshot],
          );
        })
        .catch((err) => logger.error({ err, callId }, "Realtime transcript persistence failed"));
    };

    const addTranscript = (speaker: TranscriptEntry["speaker"], text: unknown) => {
      if (typeof text !== "string") return;
      const clean = text.trim();
      if (!clean) return;
      transcript.push({
        speaker,
        text: clean.slice(0, 5000),
        timestamp: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      });
      queuePersist();
    };

    const sendToOpenAI = (payload: unknown) => {
      if (isOpen(openai)) openai.send(JSON.stringify(payload));
    };

    const clearTwilioPlayback = () => {
      if (!streamSid || twilio.readyState !== WebSocket.OPEN) return;
      twilio.send(JSON.stringify({ event: "clear", streamSid }));
    };

    const finalise = async () => {
      if (finalised) return;
      finalised = true;
      try {
        await persistChain;
        if (callId) {
          const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
          await pool.query(
            `UPDATE calls
                SET duration=$2,
                    transcript=$3::jsonb,
                    outcome=CASE
                      WHEN jsonb_array_length($3::jsonb) > 0 THEN 'Realtime phone enquiry — review'
                      ELSE 'Realtime call ended without transcript'
                    END,
                    updated_at=now()
              WHERE id=$1`,
            [callId, duration, JSON.stringify(transcript)],
          );
        }
      } catch (err) {
        logger.error({ err, callId, callSid }, "Realtime call finalisation failed");
      }
      if (isOpen(openai)) openai.close(1000, "Twilio call ended");
    };

    const startOpenAI = async () => {
      if (!companyId || !assistantId) throw new Error("Missing realtime routing context");
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

      const ctx = await loadContext(companyId, assistantId);
      const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
      openai = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Beta": "realtime=v1",
          },
        },
      );

      openai.on("open", () => {
        sendToOpenAI({
          type: "session.update",
          session: {
            type: "realtime",
            model,
            output_modalities: ["audio"],
            instructions: buildInstructions(ctx),
            max_output_tokens: 700,
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: {
                  model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
                  language: "en",
                },
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
                voice: ctx.voice,
                speed: 1.03,
              },
            },
          },
        });
      });

      openai.on("message", (raw) => {
        const event = safeJson(raw) as Record<string, any> | null;
        if (!event || typeof event.type !== "string") return;

        if (event.type === "session.updated") {
          openaiReady = true;
          for (const audio of pendingAudio.splice(0)) {
            sendToOpenAI({ type: "input_audio_buffer.append", audio });
          }
          sendToOpenAI({
            type: "response.create",
            response: {
              instructions: `Open the call now. Use this greeting naturally: "${ctx.greeting}". Do not add a long introduction.`,
            },
          });
          return;
        }

        if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
          if (streamSid && twilio.readyState === WebSocket.OPEN) {
            twilio.send(
              JSON.stringify({
                event: "media",
                streamSid,
                media: { payload: event.delta },
              }),
            );
          }
          return;
        }

        if (event.type === "input_audio_buffer.speech_started") {
          // Realtime cancels generation; clear any audio Twilio already buffered.
          clearTwilioPlayback();
          return;
        }

        if (event.type === "conversation.item.input_audio_transcription.completed") {
          addTranscript("caller", event.transcript);
          return;
        }

        if (event.type === "response.output_audio_transcript.done") {
          addTranscript("assistant", event.transcript);
          return;
        }

        if (event.type === "error") {
          logger.warn(
            {
              callId,
              callSid,
              realtimeCode: event.error?.code ?? event.code,
              realtimeType: event.error?.type ?? "error",
            },
            "OpenAI Realtime returned an error",
          );
        }
      });

      openai.on("close", (code) => {
        openaiReady = false;
        if (!finalised && twilio.readyState === WebSocket.OPEN) {
          logger.warn({ code, callId, callSid }, "OpenAI Realtime connection closed during call");
        }
      });

      openai.on("error", (err) => {
        logger.error({ err, callId, callSid }, "OpenAI Realtime websocket error");
      });
    };

    twilio.on("message", async (raw) => {
      const message = safeJson(raw) as TwilioMessage | null;
      if (!message || typeof message !== "object" || !("event" in message)) return;

      if (message.event === "start") {
        streamSid = message.start.streamSid || message.streamSid;
        callSid = message.start.callSid;
        startedAt = Date.now();

        const expectedAccount = process.env.TWILIO_ACCOUNT_SID;
        if (expectedAccount && message.start.accountSid && message.start.accountSid !== expectedAccount) {
          twilio.close(1008, "Unexpected Twilio account");
          return;
        }

        const params = message.start.customParameters ?? {};
        callId = toInt(params.callId);
        companyId = toInt(params.companyId);
        assistantId = toInt(params.assistantId);

        try {
          await startOpenAI();
        } catch (err) {
          logger.error({ err, callId, callSid }, "Could not start realtime receptionist");
          if (twilio.readyState === WebSocket.OPEN) {
            twilio.close(1011, "Realtime receptionist unavailable");
          }
        }
        return;
      }

      if (message.event === "media" && typeof message.media?.payload === "string") {
        if (openaiReady && isOpen(openai)) {
          sendToOpenAI({ type: "input_audio_buffer.append", audio: message.media.payload });
        } else if (pendingAudio.length < MAX_PENDING_AUDIO) {
          pendingAudio.push(message.media.payload);
        }
        return;
      }

      if (message.event === "stop") {
        await finalise();
      }
    });

    twilio.on("close", () => {
      void finalise();
    });

    twilio.on("error", (err) => {
      logger.error({ err, callId, callSid }, "Twilio media websocket error");
      void finalise();
    });
  });

  logger.info({ path: REALTIME_PATH }, "Realtime phone media websocket attached");
}

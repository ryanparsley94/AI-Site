import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { validTwilioWebSocketRequest } from "./voice-security";
import { finaliseRealtimeEnquiry } from "./realtime-finalise";
import { getVoicePublicBaseUrl } from "./voice-config";
import { recordVoiceDiagnostic } from "./voice-diagnostics";
import { buildOpeningGreeting, createOpeningResponseGate, isGreetingKnowledgeCategory } from "./voice-twiml";
import { getReceptionistVoicePersona, RECEPTIONIST_VOICE_PERSONAS } from "@workspace/api-zod";
import {
  getAvailableAppointmentSlots,
  bookRealtimeAppointment,
} from "./appointment-scheduling";

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
  receptionistStyle: string;
  personality: string;
  greeting: string;
  instructions: string | null;
  training: Array<{ category: string; question: string; answer: string }>;
};
const selectableRealtimeVoices = new Set<string>(RECEPTIONIST_VOICE_PERSONAS.map((persona) => persona.id));

const REALTIME_PATH = "/api/voice/media";
const MAX_PENDING_AUDIO = 250;

async function claimCallOpening(callSid: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE voice_call_sessions SET opening_greeting_started=true WHERE call_sid=$1 AND opening_greeting_started=false RETURNING call_sid",
    [callSid],
  );
  return result.rows.length === 1;
}

function toInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function realtimeVoice(value: string): string {
  // Normalize old saved selections to the current curated set.
  const aliases: Record<string, string> = {
    alloy: "cedar",
    ash: "ash",
    ballad: "coral",
    coral: "coral",
    echo: "echo",
    sage: "sage",
    shimmer: "shimmer",
    verse: "echo",
    cedar: "cedar",
    fable: "sage",
    nova: "coral",
    onyx: "echo",
  };
  return aliases[value.toLowerCase()] ?? "cedar";
}

async function loadContext(companyId: number, assistantId: number, selectedVoice?: string, displayName?: string): Promise<AssistantContext> {
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
    realtime_voice: string;
    personality: string;
    receptionist_style: string;
    greeting: string;
    instructions: string | null;
  }>(
    `SELECT id,name,realtime_voice,personality,receptionist_style,greeting,instructions
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
    assistantName: displayName?.trim() || assistant.rows[0].name,
    voice: selectedVoice && selectableRealtimeVoices.has(selectedVoice)
      ? selectedVoice
      : realtimeVoice(assistant.rows[0].realtime_voice),
    personality: assistant.rows[0].personality,
    receptionistStyle: assistant.rows[0].receptionist_style,
    greeting: assistant.rows[0].greeting,
    instructions: assistant.rows[0].instructions,
    // Keep stored knowledge intact, but never inject a second scripted greeting.
    training: training.rows.filter((entry) => !isGreetingKnowledgeCategory(entry.category)),
  };
}

function buildInstructions(ctx: AssistantContext): string {
  const persona = getReceptionistVoicePersona(ctx.voice);
  const knowledge = ctx.training.length
    ? ctx.training
        .slice(0, 100)
        .map((entry) => `[${entry.category}] ${entry.question}: ${entry.answer}`)
        .join("\n")
    : "No additional business knowledge has been configured.";

  return `You are ${ctx.assistantName}, the virtual receptionist for ${ctx.companyName}, a UK trade business.

VOICE AND CONVERSATION
- Speak in natural British English with a warm, capable, concise receptionist style.
- Use this subtle persona direction where the voice supports it: ${persona.direction}. This is guidance, not a guarantee of a specific regional accent.
- Sound conversational, not scripted. Keep turns short and do not repeat information unnecessarily.
- Respond promptly after the caller finishes, but do not talk over them.
- The caller may interrupt you. Stop speaking immediately and listen.
- Never transfer the call to the owner or another person. The business owner may be on site or on the tools and calls must not be forwarded.
- If asked whether you are AI, answer truthfully that you are the business's virtual receptionist.
- The saved receptionist greeting is sent separately once at the start of the call. Never repeat, paraphrase, or initiate another greeting from website or business knowledge.

PRIMARY JOB
1. Understand why the caller is calling.
2. Answer routine questions only when the answer is present in the business details or Business Knowledge.
3. Capture enough information for the team to act without calling the customer back just to ask basic questions.
4. Naturally gather the caller's full name, best callback number, job address/postcode when relevant, description of the work/problem, urgency or safety details, and preferred availability.
5. If the caller wants to book a visit, use the appointment tools. Never claim a time is available until get_available_appointments returns it.
6. Offer only times returned by get_available_appointments. Once the caller chooses one of those exact times and you have their name, job address/postcode, and what they need help with, use book_appointment.
7. Only tell the caller an appointment is booked if book_appointment returns status "booked". If it fails or the slot was taken, apologise briefly and check availability again.
8. If you cannot resolve something, say you will pass the details to the team. Do not invent an answer, price, availability, accreditation, service, diagnosis, or promise.

SAFETY
- If there is immediate danger, fire, electric shock, smell of gas, or another emergency, prioritise safety and tell the caller to contact the appropriate emergency service/provider.
- Never give risky DIY electrical, gas, structural or other hazardous instructions.

BUSINESS DETAILS
Company: ${ctx.companyName}
Main number: ${ctx.companyPhone || "not configured"}
Email: ${ctx.companyEmail || "not configured"}
Receptionist personality: ${ctx.personality}. Style: ${ctx.receptionistStyle}
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
  const base = getVoicePublicBaseUrl();
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
    let selectedVoice: string | undefined;
    let selectedDisplayName: string | undefined;
    let startedAt = Date.now();
    let openaiReady = false;
    let finalised = false;
    let recoveryPromptSent = false;
    let openingResponseStarted = false;
    let openingResponseIssued = false;
    let openingResponseFinished = false;
    const openingResponseGate = createOpeningResponseGate();
    let pendingAudio: string[] = [];
    const transcript: TranscriptEntry[] = [];
    let persistChain: Promise<void> = Promise.resolve();
    let toolChain: Promise<void> = Promise.resolve();
    let playbackGeneration = 0;
    let currentOutputItemId = "";
    let sentAudioMs = 0;
    let playedAudioMs = 0;

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
        .catch(async (err) => {
          logger.error({ err, callId }, "Realtime transcript persistence failed");
          await recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "transcript_persist_failed",
            summary: "Realtime transcript could not be persisted.",
            details: { stage: "incremental_transcript_write" },
          });
        });
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
    const flushPendingAudio = () => {
      for (const audio of pendingAudio.splice(0)) {
        sendToOpenAI({ type: "input_audio_buffer.append", audio });
      }
    };

    const clearTwilioPlayback = () => {
      if (!streamSid || twilio.readyState !== WebSocket.OPEN) return;

      const interruptedItemId = currentOutputItemId;
      const truncateAtMs = Math.max(0, Math.floor(playedAudioMs));

      // Twilio returns outstanding mark events after a clear. Advance the
      // generation first so those cleared marks cannot be mistaken for audio
      // the caller actually heard.
      playbackGeneration += 1;
      twilio.send(JSON.stringify({ event: "clear", streamSid }));

      if (interruptedItemId && isOpen(openai)) {
        sendToOpenAI({
          type: "conversation.item.truncate",
          item_id: interruptedItemId,
          content_index: 0,
          audio_end_ms: truncateAtMs,
        });
      }

      currentOutputItemId = "";
      sentAudioMs = 0;
      playedAudioMs = 0;
    };

    const returnToolResult = (callIdValue: string, result: unknown) => {
      sendToOpenAI({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callIdValue,
          output: JSON.stringify(result),
        },
      });
      sendToOpenAI({ type: "response.create" });
    };

    const handleToolCall = async (item: Record<string, any>) => {
      const toolCallId = typeof item.call_id === "string" ? item.call_id : "";
      const name = typeof item.name === "string" ? item.name : "";
      if (!toolCallId || !name || !companyId || !callId || !callSid) return;

      let args: Record<string, unknown> = {};
      try {
        args = typeof item.arguments === "string" && item.arguments
          ? JSON.parse(item.arguments)
          : {};
      } catch {
        returnToolResult(toolCallId, {
          status: "error",
          message: "The booking request was incomplete. Ask the caller for the details again.",
        });
        return;
      }

      try {
        if (name === "get_available_appointments") {
          const slots = await getAvailableAppointmentSlots(companyId, 6);
          returnToolResult(toolCallId, {
            status: "ok",
            slots,
            instruction:
              slots.length > 0
                ? "Offer these exact slots to the caller. Do not invent or alter a time."
                : "No automatic appointment slots are currently available. Take the caller's preferred availability as a message instead.",
          });
          return;
        }

        if (name === "book_appointment") {
          await recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "booking_attempt",
            summary: "Receptionist attempted to book an appointment.",
            details: {},
          });
          const result = await bookRealtimeAppointment({
            companyId,
            callId,
            callSid,
            slotIso: typeof args.slot_iso === "string" ? args.slot_iso : "",
            callerName: typeof args.caller_name === "string" ? args.caller_name : "",
            serviceDescription:
              typeof args.service_description === "string" ? args.service_description : "",
            address: typeof args.address === "string" ? args.address : "",
          });

          if (result.ok) {
            await recordVoiceDiagnostic({
              callSid,
              callId,
              companyId,
              eventType: "booking_result",
              summary: "Appointment booking succeeded.",
              details: { result: "booked", jobId: result.jobId },
            });
            returnToolResult(toolCallId, {
              status: "booked",
              job_id: result.jobId,
              slot_iso: result.iso,
              slot_label: result.label,
              instruction:
                "The appointment is now booked in CREWON. Confirm this exact time to the caller.",
            });
          } else {
            await recordVoiceDiagnostic({
              callSid,
              callId,
              companyId,
              eventType: "booking_result",
              summary: "Appointment booking was not completed.",
              details: { result: result.reason },
            });
            returnToolResult(toolCallId, {
              status: "error",
              reason: result.reason,
              message: result.message,
            });
          }
          return;
        }

        returnToolResult(toolCallId, {
          status: "error",
          message: "That action is not available.",
        });
      } catch (error) {
        await recordVoiceDiagnostic({
          callSid,
          callId,
          companyId,
          eventType: "technical_error",
          summary: "Realtime receptionist scheduling tool failed.",
          details: { stage: "booking_tool", errorType: error instanceof Error ? error.name.slice(0, 40) : "unknown" },
        });
        logger.error(
          { err: error, callId, callSid, tool: name },
          "Realtime receptionist tool failed",
        );
        returnToolResult(toolCallId, {
          status: "error",
          message:
            "The scheduling system could not complete that action. Take the caller's preferred time as a message instead.",
        });
      }
    };

    const finalise = async () => {
      if (finalised) return;
      finalised = true;
      try {
        await persistChain;
        await toolChain;
        if (callId && companyId && assistantId && callSid) {
          const durationSeconds = Math.max(
            0,
            Math.round((Date.now() - startedAt) / 1000),
          );
          await finaliseRealtimeEnquiry({
            callSid,
            callId,
            companyId,
            assistantId,
            transcript,
            durationSeconds,
          });
          void recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "transcript_saved",
            summary: "Final call transcript was persisted.",
            details: { transcriptEntries: transcript.length },
          });
          await recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "finalisation_succeeded",
            summary: "Realtime call finalisation completed.",
            details: { durationSeconds, transcriptEntries: transcript.length },
          });
        }
      } catch (err) {
        await recordVoiceDiagnostic({
          callSid,
          callId,
          companyId,
          eventType: "finalisation_failed",
          summary: "Realtime call finalisation failed.",
          details: { stage: "call_finalisation", errorType: err instanceof Error ? err.name.slice(0, 40) : "unknown" },
        });
        await recordVoiceDiagnostic({
          callSid,
          callId,
          companyId,
          eventType: "technical_error",
          summary: "Realtime call finalisation failed.",
          details: { stage: "call_finalisation" },
        });
        logger.error({ err, callId, callSid }, "Realtime call finalisation failed");
      }
      if (isOpen(openai)) openai.close(1000, "Twilio call ended");
    };

    const startOpenAI = async () => {
      if (!companyId || !assistantId) throw new Error("Missing realtime routing context");
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

      const ctx = await loadContext(companyId, assistantId, selectedVoice, selectedDisplayName);
      const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
      openai = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      openai.on("open", () => {
        sendToOpenAI({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["audio"],
            instructions: buildInstructions(ctx),
            max_output_tokens: 700,
            tools: [
              {
                type: "function",
                name: "get_available_appointments",
                description:
                  "Get the next real appointment slots available for this company. Use this before offering any appointment time to a caller.",
                parameters: {
                  type: "object",
                  properties: {},
                  required: [],
                  additionalProperties: false,
                },
              },
              {
                type: "function",
                name: "book_appointment",
                description:
                  "Book one exact appointment slot previously returned by get_available_appointments. Only use after the caller clearly chooses that slot and their name, job address/postcode and work required are known.",
                parameters: {
                  type: "object",
                  properties: {
                    slot_iso: {
                      type: "string",
                      description:
                        "The exact ISO timestamp returned by get_available_appointments.",
                    },
                    caller_name: {
                      type: "string",
                      description: "The caller's full name.",
                    },
                    service_description: {
                      type: "string",
                      description:
                        "A concise factual description of the work or problem the caller needs help with.",
                    },
                    address: {
                      type: "string",
                      description: "The job address and postcode.",
                    },
                  },
                  required: [
                    "slot_iso",
                    "caller_name",
                    "service_description",
                    "address",
                  ],
                  additionalProperties: false,
                },
              },
            ],
            tool_choice: "auto",
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
          void recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "realtime_session_started",
            summary: "OpenAI Realtime session is ready for the call.",
            details: { voice: ctx.voice },
          });
          logger.info({ callId, callSid, assistantId, voice: selectedVoice ?? "saved-default" }, "Realtime receptionist session ready");
          if (openingResponseGate()) {
            openingResponseStarted = true;
            void claimCallOpening(callSid).then((claimed) => {
              if (!claimed) {
                openingResponseIssued = true;
                openingResponseFinished = true;
                flushPendingAudio();
                return;
              }
              sendToOpenAI({
                type: "response.create",
                response: {
                  instructions: `Say this saved receptionist greeting exactly once, then listen: "${buildOpeningGreeting(ctx.companyName, ctx.greeting, ctx.assistantName)}". Do not add another greeting.`,
                },
              });
              openingResponseIssued = true;
              // Caller audio received while the database claim was in flight is
              // replayed after the opening response is queued, so VAD can still
              // interrupt it without racing a second automatic opening.
              flushPendingAudio();
            }).catch((error) => {
              logger.error({ err: error, callId, callSid }, "Could not claim the one-time call greeting");
              if (twilio.readyState === WebSocket.OPEN) twilio.close(1011, "Call greeting could not be started");
            });
          }
          return;
        }

        if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
          if (streamSid && twilio.readyState === WebSocket.OPEN) {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            if (itemId && itemId !== currentOutputItemId) {
              playbackGeneration += 1;
              currentOutputItemId = itemId;
              sentAudioMs = 0;
              playedAudioMs = 0;
            }

            // PCMU is 8 kHz, 8-bit: 8 decoded bytes = 1 ms of audio.
            sentAudioMs += Buffer.from(event.delta, "base64").length / 8;
            if (sentAudioMs === Buffer.from(event.delta, "base64").length / 8) {
              logger.info({ callId, callSid, itemId, voice: selectedVoice ?? "saved-default" }, "Realtime receptionist audio playback started");
            }
            twilio.send(
              JSON.stringify({
                event: "media",
                streamSid,
                media: { payload: event.delta },
              }),
            );
            twilio.send(
              JSON.stringify({
                event: "mark",
                streamSid,
                mark: {
                  name: `ai:${playbackGeneration}:${Math.round(sentAudioMs)}`,
                },
              }),
            );
          }
          return;
        }

        if (event.type === "input_audio_buffer.speech_started") {
          logger.debug({ callId, callSid, itemId: currentOutputItemId || undefined }, "Caller speech detected; interrupting receptionist playback");
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

        if (event.type === "response.done" && openingResponseStarted && !openingResponseFinished) {
          openingResponseFinished = true;
          flushPendingAudio();
        }

        if (
          event.type === "response.done" &&
          event.response?.status === "completed" &&
          Array.isArray(event.response?.output)
        ) {
          const calls = event.response.output.filter(
            (item: Record<string, unknown>) =>
              item?.type === "function_call" &&
              item?.status === "completed" &&
              typeof item?.call_id === "string",
          );
          for (const item of calls) {
            toolChain = toolChain
              .then(() => handleToolCall(item as Record<string, any>))
              .catch((error) =>
                logger.error(
                  { err: error, callId, callSid },
                  "Realtime tool queue failed",
                ),
              );
          }
          return;
        }

        if (event.type === "error") {
          void recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "technical_error",
            summary: "OpenAI Realtime reported an error.",
            details: { stage: "openai_event", providerCode: typeof event.error?.code === "string" ? event.error.code.slice(0, 50) : "unknown" },
          });
          logger.warn(
            {
              callId,
              callSid,
              realtimeCode: event.error?.code ?? event.code,
              realtimeType: event.error?.type ?? "error",
              realtimeParam: event.error?.param ?? null,
              realtimeMessage: typeof event.error?.message === "string" ? event.error.message.slice(0, 240) : null,
              eventId: event.event_id ?? null,
            },
            "OpenAI Realtime returned an error",
          );
          if (isOpen(openai) && !recoveryPromptSent) {
            recoveryPromptSent = true;
            sendToOpenAI({
              type: "response.create",
              response: {
                instructions: "Briefly apologise that there was a momentary audio problem, ask the caller to repeat their last point, and say you can take a message if it happens again.",
              },
            });
          }
          return;
        }

        if (event.type === "response.done" && event.response?.status && event.response.status !== "completed" && event.response.status !== "cancelled") {
          logger.warn({
            callId, callSid, responseStatus: event.response.status,
            statusDetails: event.response.status_details ?? null,
            responseId: event.response.id ?? null,
          }, "Realtime receptionist response did not complete");
        }
      });

      openai.on("close", (code) => {
        openaiReady = false;
        if (!finalised && twilio.readyState === WebSocket.OPEN) {
          logger.warn({ code, callId, callSid, sentAudioMs: Math.round(sentAudioMs), playedAudioMs: Math.round(playedAudioMs) }, "OpenAI Realtime connection closed during call");
          // With no OpenAI audio connection, keep the call from lingering in dead air.
          twilio.close(1011, "Realtime audio connection ended");
        }
      });

      openai.on("error", (err) => {
        void recordVoiceDiagnostic({
          callSid,
          callId,
          companyId,
          eventType: "technical_error",
          summary: "OpenAI Realtime connection failed.",
          details: { stage: "openai_websocket", errorType: err.name.slice(0, 40) },
        });
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
        selectedVoice = selectableRealtimeVoices.has(params.voice ?? "") ? params.voice : undefined;
        selectedDisplayName = typeof params.receptionistName === "string" && /^[\p{L}][\p{L}\p{M} .'-]{0,39}$/u.test(params.receptionistName)
          ? params.receptionistName.trim()
          : undefined;
        logger.info({ callId, callSid, companyId, assistantId, voice: selectedVoice ?? "saved-default", demoDisplayName: selectedDisplayName }, "Twilio realtime stream started");

        try {
          await startOpenAI();
        } catch (err) {
          await recordVoiceDiagnostic({
            callSid,
            callId,
            companyId,
            eventType: "technical_error",
            summary: "Could not start OpenAI Realtime for the call.",
            details: { stage: "realtime_start", errorType: err instanceof Error ? err.name.slice(0, 40) : "unknown" },
          });
          logger.error({ err, callId, callSid }, "Could not start realtime receptionist");
          if (twilio.readyState === WebSocket.OPEN) {
            twilio.close(1011, "Realtime receptionist unavailable");
          }
        }
        return;
      }

      if (message.event === "media" && typeof message.media?.payload === "string") {
        if (openaiReady && isOpen(openai) && (!openingResponseStarted || openingResponseIssued)) {
          sendToOpenAI({ type: "input_audio_buffer.append", audio: message.media.payload });
        } else if (pendingAudio.length < MAX_PENDING_AUDIO) {
          pendingAudio.push(message.media.payload);
        }
        return;
      }

      if (message.event === "mark" && typeof message.mark?.name === "string") {
        const match = /^ai:(\d+):(\d+)$/.exec(message.mark.name);
        if (match && Number(match[1]) === playbackGeneration) {
          playedAudioMs = Math.max(playedAudioMs, Number(match[2]));
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
      void recordVoiceDiagnostic({
        callSid,
        callId,
        companyId,
        eventType: "technical_error",
        summary: "Twilio media stream failed.",
        details: { stage: "twilio_websocket", errorType: err.name.slice(0, 40) },
      });
      logger.error({ err, callId, callSid }, "Twilio media websocket error");
      void finalise();
    });
  });

  logger.info({ path: REALTIME_PATH }, "Realtime phone media websocket attached");
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, AudioLines, CheckCircle2, Globe2,
  LoaderCircle, Mic, MicOff, Phone, RotateCcw, ShieldCheck, Sparkles, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type BusinessProfile = Record<string, unknown>;
type PreviewResponse = { preview: BusinessProfile; source?: unknown };
type TranscriptItem = { role: "caller" | "receptionist"; text: string };
type CapturedLead = {
  name?: string; phone?: string; workNeeded?: string; siteAddress?: string;
  urgency?: string; summary?: string; nextAction?: string; contactId?: number | null; jobId?: number | null;
};
type FinalizeResponse = {
  lead: CapturedLead;
  booking: { status: string; slot?: string; jobId?: number } | null;
};
type AvailableSlot = { iso: string; label: string };
type Stage = "profile" | "call" | "result";
type CallStatus = "idle" | "connecting" | "live" | "ending" | "error";

const RECEPTIONIST_NAME = "Maya";
function apiPath(path: string) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${base}${path}`;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(apiPath(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.message || body?.error || `The demo service returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function readable(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(", ");
  return "";
}

function profileRows(profile: BusinessProfile) {
  const entries: [string, unknown][] = [
    ["Business", profile.businessName ?? profile.name ?? profile.companyName],
    ["Trade", profile.trade ?? profile.industry ?? profile.serviceType],
    ["Service area", profile.serviceArea ?? profile.location ?? profile.area],
    ["About", profile.description ?? profile.about ?? profile.summary],
    ["Services", profile.services ?? profile.specialties],
    ["Opening hours", profile.openingHours ?? profile.hours],
  ];
  return entries.map(([label, value]) => ({ label, value: readable(value) })).filter((row) => row.value);
}

function eventText(event: Record<string, unknown>) {
  return typeof event.transcript === "string" ? event.transcript :
    typeof event.text === "string" ? event.text : "";
}

function formatField(value?: string) {
  return value?.trim() || "Not shared on this call";
}

export function CallDemoModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>("profile");
  const [receptionistName, setReceptionistName] = useState(RECEPTIONIST_NAME);
  const [website, setWebsite] = useState("");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [websiteSource, setWebsiteSource] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [lead, setLead] = useState<CapturedLead | null>(null);
  const [booking, setBooking] = useState<FinalizeResponse["booking"]>(null);
  const [demoSlot, setDemoSlot] = useState("");
  const [livePilotConsent, setLivePilotConsent] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [micReady, setMicReady] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const demoIdRef = useRef<string | null>(null);
  const receptionistNameRef = useRef(RECEPTIONIST_NAME);
  const itemIndexesRef = useRef<Record<string, number>>({});

  const closeConnection = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setMicReady(false);
  }, []);

  const reset = useCallback(() => {
    closeConnection();
    setStage("profile");
    setReceptionistName(RECEPTIONIST_NAME);
    receptionistNameRef.current = RECEPTIONIST_NAME;
    setWebsite("");
    setProfile(null);
    setWebsiteSource("");
    setPreviewBusy(false);
    setCallStatus("idle");
    setError("");
    setTranscript([]);
    transcriptRef.current = [];
    setLead(null);
    setBooking(null);
    setDemoSlot("");
    setLivePilotConsent(false);
    setAvailableSlots([]);
    demoIdRef.current = null;
    itemIndexesRef.current = {};
  }, [closeConnection]);

  useEffect(() => {
    if (!open) reset();
    return () => closeConnection();
  }, [open, reset, closeConnection]);

  function appendTranscript(role: TranscriptItem["role"], text: string, itemId?: string, replace = false) {
    if (!text.trim()) return;
    const items = [...transcriptRef.current];
    if (itemId && itemIndexesRef.current[itemId] !== undefined) {
      const index = itemIndexesRef.current[itemId];
      items[index] = { ...items[index], text: replace ? text : `${items[index].text}${text}` };
    } else {
      const index = items.length;
      items.push({ role, text });
      if (itemId) itemIndexesRef.current[itemId] = index;
    }
    transcriptRef.current = items;
    setTranscript(items);
  }

  async function loadProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!website.trim()) return;
    setPreviewBusy(true);
    setError("");
    try {
      const result = await postJson<PreviewResponse>("/api/public-demo/website-preview", { url: website.trim() });
      if (!result.preview || typeof result.preview !== "object") throw new Error("We couldn't read a business profile from that website.");
      setProfile(result.preview);
      const savedReceptionist = readable(result.preview.receptionistName) || RECEPTIONIST_NAME;
      setReceptionistName(savedReceptionist);
      receptionistNameRef.current = savedReceptionist;
      setWebsiteSource(readable(result.source) || new URL(website).hostname);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Website preview is unavailable. Please try again.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function startCall() {
    if (!profile || callStatus === "connecting" || callStatus === "live") return;
    if (!livePilotConsent) {
      setError("Confirm that this call may create a real Parsley Electrical enquiry or appointment in CREWON.");
      return;
    }
    setError("");
    setCallStatus("connecting");
    transcriptRef.current = [];
    setTranscript([]);
    itemIndexesRef.current = {};
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error("Live audio isn't supported in this browser. Try a current version of Chrome, Safari or Edge.");
      }
      // Permission is requested only after this explicit user action.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicReady(true);

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addTrack(stream.getAudioTracks()[0], stream);
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play().catch(() => {
            setError("Your browser blocked call audio. Check your sound settings and try again.");
          });
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          setCallStatus("error");
          setError("The live audio connection ended unexpectedly. Your microphone has been closed.");
          closeConnection();
        }
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = async (message) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(message.data) as Record<string, unknown>; } catch { return; }
        if (event.type === "error") {
          const eventError = event.error as { message?: string } | undefined;
          setError(eventError?.message || "The live receptionist couldn't respond. Please try again.");
          return;
        }
        const itemId = typeof event.item_id === "string" ? event.item_id : undefined;
        if (event.type === "conversation.item.input_audio_transcription.completed") {
          appendTranscript("caller", eventText(event), itemId, true);
        } else if (event.type === "response.output_audio_transcript.delta") {
          appendTranscript("receptionist", eventText(event), itemId);
        } else if (event.type === "response.output_audio_transcript.done") {
          appendTranscript("receptionist", eventText(event), itemId, true);
        } else if (event.type === "response.audio_transcript.done") {
          appendTranscript("receptionist", eventText(event), itemId, true);
        } else if (event.type === "response.audio.delta") {
          setCallStatus("live");
        } else if (event.type === "input_audio_buffer.speech_started") {
          // Live turn feedback; transcription arrives via the completed event.
        } else if (event.type === "response.function_call_arguments.done" &&
          (event.name === "get_available_appointments" || event.name === "book_appointment")) {
          const callId = typeof event.call_id === "string" ? event.call_id : "";
          let output: unknown;
          try {
            const args = JSON.parse(String(event.arguments || "{}")) as Record<string, string>;
            const demoId = demoIdRef.current;
            if (!demoId) throw new Error("The pilot session has expired.");
            if (event.name === "get_available_appointments") {
              const result = await postJson<{ slots: AvailableSlot[] }>("/api/public-demo/appointments/available", { demoId });
              setAvailableSlots(result.slots);
              output = { status: "ok", slots: result.slots, instruction: "Offer only these exact returned appointment slots." };
            } else {
              const result = await postJson<{ status: string; jobId: number; slot: string }>("/api/public-demo/appointments/book", {
                demoId, slotIso: args.slot_iso, callerName: args.caller_name,
                callerPhone: args.caller_phone, serviceDescription: args.service_description, address: args.address,
              });
              setBooking(result);
              setDemoSlot(result.slot);
              output = { ...result, instruction: "The real Parsley Electrical appointment is booked. Confirm this exact time." };
            }
          } catch (caught) {
            output = { status: "error", message: caught instanceof Error ? caught.message : "The live booking request failed. Do not say a time is booked." };
          }
          if (callId && channel.readyState === "open") {
            channel.send(JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
            }));
            channel.send(JSON.stringify({ type: "response.create" }));
          }
        }
      };
      channel.onopen = () => {
        channel.send(JSON.stringify({
          type: "response.create",
          response: {
              instructions: `Greet the caller now as ${receptionistNameRef.current} from ${businessName}. Be warm, brief and natural; ask how you can help.`,
          },
        }));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peer.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          let timeout = 0;
          const finishGathering = () => {
            window.clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", onGatheringComplete);
            resolve();
          };
          const onGatheringComplete = () => {
            if (peer.iceGatheringState !== "complete") return;
            finishGathering();
          };
          timeout = window.setTimeout(finishGathering, 2000);
          peer.addEventListener("icegatheringstatechange", onGatheringComplete);
        });
      }
      const answer = await postJson<{ clientSecret: string; demoId: string; receptionistName: string }>(
        "/api/public-demo/realtime-session",
        {
          profile,
          receptionistName,
          consent: livePilotConsent,
          websiteFacts: profile,
        },
      );
      if (!answer.clientSecret || !answer.demoId) throw new Error("The live demo service returned an incomplete session.");
      demoIdRef.current = answer.demoId;
      receptionistNameRef.current = answer.receptionistName;
      setReceptionistName(answer.receptionistName);
      const sdp = peer.localDescription?.sdp ?? offer.sdp;
      const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls?model=gpt-realtime-2.1", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${answer.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
      });
      if (!realtimeResponse.ok) {
        throw new Error("OpenAI Realtime could not connect. Please retry the demo.");
      }
      const sdpAnswer = await realtimeResponse.text();
      if (!sdpAnswer) throw new Error("OpenAI Realtime returned an empty audio connection.");
      await peer.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
      setCallStatus("live");
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      closeConnection();
      setCallStatus("error");
      setError(caught instanceof Error ? caught.message : "Live demo is unavailable. No device voice fallback is used.");
    }
  }

  async function finishCall() {
    setCallStatus("ending");
    closeConnection();
    const demoId = demoIdRef.current;
    if (!demoId) {
      setCallStatus("error");
      setError("This live session could not be saved because the demo service did not provide a session ID.");
      return;
    }
    try {
      const result = await postJson<FinalizeResponse>("/api/public-demo/finalize", {
        demoId,
        transcript: transcriptRef.current.map((line) => `${line.role === "caller" ? "Caller" : receptionistName}: ${line.text}`).join("\n"),
      });
      setLead(result.lead);
      setBooking(result.booking);
      setStage("result");
      setCallStatus("idle");
    } catch (caught) {
      setCallStatus("error");
      setError(caught instanceof Error ? caught.message : "We couldn't prepare the enquiry summary. Please retry.");
    }
  }

  const rows = profile ? profileRows(profile) : [];
  const businessName = readable(profile?.businessName ?? profile?.name ?? profile?.companyName) || "Your business";
  const callInProgress = callStatus === "connecting" || callStatus === "live" || callStatus === "ending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="call-demo-description"
        className="w-[calc(100vw-1rem)] max-w-xl max-h-[min(92dvh,800px)] overflow-hidden gap-0 rounded-2xl border border-white/10 bg-[#0D171C] p-0 text-white shadow-2xl [&>button:last-child]:hidden"
        data-testid="dialog-live-demo"
      >
        <div className="flex max-h-[min(92dvh,800px)] flex-col">
          <header className="shrink-0 border-b border-white/10 bg-[#122128] px-4 pb-4 pt-4 sm:px-6">
            <DialogTitle className="sr-only">CREWON live receptionist demo</DialogTitle>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#36C6D5]/25 bg-[#36C6D5]/10 text-[#36C6D5]">
                  <AudioLines size={19} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#36C6D5]">CREWON live demo</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">Try your AI receptionist</p>
                </div>
                <button
                  type="button"
                  aria-label="Close live demo"
                  onClick={() => onOpenChange(false)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36C6D5]"
                  data-testid="button-close-live-demo"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <p id="call-demo-description" className="mt-3 text-xs leading-relaxed text-white/55">
              A live OpenAI Realtime conversation using Parsley’s saved training and reviewed website profile.
            </p>
            <ol aria-label="Demo steps" className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["profile", "Business"],
                ["call", "Live call"],
                ["result", "Enquiry"],
              ].map(([key, label], index) => {
                const active = stage === key;
                const complete = (stage === "call" && index === 0) || (stage === "result" && index < 2);
                return (
                  <li key={key} className="min-w-0">
                    <div className={`h-1 rounded-full ${active || complete ? "bg-[#36C6D5]" : "bg-white/10"}`} />
                    <p className={`mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wide ${active ? "text-[#36C6D5]" : "text-white/40"}`}>
                      {String(index + 1).padStart(2, "0")} · {label}
                    </p>
                  </li>
                );
              })}
            </ol>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {error && (
              <div role="alert" data-testid="status-live-demo-error" className="mb-4 flex gap-2.5 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-100">
                <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-300" />
                <span>{error}</span>
              </div>
            )}

            {stage === "profile" && (
              <section aria-labelledby="profile-heading">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#36C6D5]">First, make it yours</p>
                  <h2 id="profile-heading" className="mt-1 text-xl font-bold tracking-tight">Your website, in the room.</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/55">The pilot combines Parsley Electrical’s saved receptionist training with its reviewed website profile. Call details can create real records in the CrewOn office.</p>
                </div>
                <form onSubmit={loadProfile} className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="demo-website" className="sr-only">Business website address</label>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-white/[.04] px-3 focus-within:border-[#36C6D5]/60">
                    <Globe2 size={16} className="shrink-0 text-white/40" />
                    <input
                      id="demo-website"
                      type="url"
                      required
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      placeholder="https://yourbusiness.co.uk"
                      className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                      data-testid="input-business-website"
                    />
                  </div>
                  <Button type="submit" disabled={previewBusy || !website.trim()} className="h-12 shrink-0 gap-2 bg-[#36C6D5] px-5 font-semibold text-[#0D171C] hover:bg-[#58d3de]" data-testid="button-preview-website">
                    {previewBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {previewBusy ? "Reading site" : "Build my profile"}
                  </Button>
                </form>

                {profile && (
                  <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="rounded-2xl border border-white/10 bg-[#14252C] p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#83dbe3]">
                            <CheckCircle2 size={14} /> Profile found
                          </div>
                          <h3 className="mt-2 truncate text-lg font-bold">{businessName}</h3>
                          <p className="mt-1 truncate text-xs text-white/45">Source · {websiteSource}</p>
                        </div>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#36C6D5]/10 text-[#36C6D5]">
                          <ShieldCheck size={20} />
                        </span>
                      </div>
                      {rows.length > 0 ? (
                        <dl className="mt-4 grid gap-3 border-t border-white/8 pt-4 sm:grid-cols-2">
                          {rows.map((row) => (
                            <div key={row.label} className="min-w-0">
                              <dt className="text-[10px] font-bold uppercase tracking-wider text-white/35">{row.label}</dt>
                              <dd className="mt-1 line-clamp-3 break-words text-sm leading-relaxed text-white/80">{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-4 border-t border-white/8 pt-4 text-sm text-white/60">Website details are ready. {receptionistName} will stick to saved training and reviewed facts.</p>
                      )}
                    </div>
                    <div className="mt-4 rounded-xl border border-[#36C6D5]/15 bg-[#36C6D5]/[.06] p-3.5">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <UserRound size={16} className="text-[#36C6D5]" />
                        Meet {receptionistName}
                        <span className="ml-auto rounded-full bg-[#36C6D5]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7bd9e1]">AI receptionist</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-white/55">Ask about your services, then try a customer enquiry. Your mic starts only when you choose to begin.</p>
                    </div>
                    <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-200/[.05] p-3 text-xs leading-relaxed text-amber-100/80">
                      <input type="checkbox" checked={livePilotConsent} onChange={(event) => setLivePilotConsent(event.target.checked)} className="mt-0.5 accent-[#36C6D5]" />
                      I understand this call may save my details to Parsley Electrical’s CrewOn office and may book a real appointment if I confirm one.
                    </label>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                      <Button type="button" variant="ghost" onClick={() => { setProfile(null); setError(""); }} className="text-white/65 hover:bg-white/5 hover:text-white" data-testid="button-change-website">
                        Change website
                      </Button>
                      <Button type="button" disabled={!livePilotConsent} onClick={() => { setError(""); setStage("call"); }} className="h-11 gap-2 bg-[#36C6D5] px-5 font-semibold text-[#0D171C] hover:bg-[#58d3de] disabled:opacity-40" data-testid="button-continue-to-call">
                        Meet {receptionistName} <ArrowRight size={16} />
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {stage === "call" && (
              <section aria-labelledby="call-heading">
                <button type="button" onClick={() => { closeConnection(); setCallStatus("idle"); setStage("profile"); setError(""); }} disabled={callInProgress} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 hover:text-white disabled:opacity-40" data-testid="button-back-to-profile">
                  <ArrowLeft size={14} /> Business profile
                </button>
                <div className="text-center">
                  <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border transition-colors ${callStatus === "live" ? "border-[#36C6D5]/40 bg-[#36C6D5]/15 text-[#36C6D5]" : "border-white/10 bg-white/[.04] text-white/55"}`}>
                    {callStatus === "live" ? <AudioLines size={30} /> : <UserRound size={30} />}
                  </div>
                  <h2 id="call-heading" className="mt-4 text-xl font-bold">{callStatus === "live" ? "You’re live with the Parsley receptionist" : "Have a real conversation"}</h2>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-white/55">
                    {callStatus === "live" ? "Speak naturally. The receptionist can answer from saved training and the website profile." : "This connects to OpenAI Realtime. Your microphone starts only after you tap below; no synthetic browser voice is used."}
                  </p>
                </div>

                <div className="my-5 rounded-xl border border-white/10 bg-[#122128] px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Live Parsley availability</p>
                    <span className="rounded-full border border-[#36C6D5]/15 bg-[#36C6D5]/[.06] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#83dbe3]">Live schedule</span>
                  </div>
                  <p className="mt-1 text-xs text-white/45">The receptionist checks availability during the call and offers only returned slots.</p>
                  {availableSlots.length > 0 && <ul className="mt-2 space-y-1 text-xs text-[#8be2e9]">{availableSlots.map((slot) => <li key={slot.iso}>{slot.label}</li>)}</ul>}
                </div>

                {transcript.length > 0 && (
                  <div className="mb-4 max-h-48 space-y-3 overflow-y-auto rounded-xl border border-white/8 bg-white/[.025] p-3" aria-label="Live transcript" data-testid="list-live-transcript">
                    {transcript.map((line, index) => (
                      <div key={`${line.role}-${index}`} className="flex gap-2 text-sm">
                        <span className={`w-[76px] shrink-0 text-[10px] font-bold uppercase tracking-wide ${line.role === "caller" ? "text-white/40" : "text-[#71d4de]"}`}>
                          {line.role === "caller" ? "You" : receptionistName}
                        </span>
                        <p className="min-w-0 whitespace-pre-wrap leading-relaxed text-white/75">{line.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                <audio ref={audioRef} autoPlay playsInline className="sr-only" aria-label="Receptionist audio" />
                <div className="flex flex-col items-center gap-3">
                  {callStatus === "idle" || callStatus === "error" ? (
                    <Button type="button" onClick={startCall} className="h-12 w-full gap-2 rounded-xl bg-[#36C6D5] font-bold text-[#0D171C] hover:bg-[#58d3de] sm:w-auto sm:min-w-56" data-testid="button-start-live-call">
                      <Mic size={17} /> Start live call
                    </Button>
                  ) : callStatus === "connecting" ? (
                    <Button type="button" disabled className="h-12 w-full gap-2 rounded-xl bg-[#36C6D5]/70 font-bold text-[#0D171C] sm:w-auto sm:min-w-56" data-testid="status-connecting-call">
                      <LoaderCircle size={17} className="animate-spin" /> Connecting securely…
                    </Button>
                  ) : (
                    <Button type="button" onClick={finishCall} disabled={callStatus !== "live"} className="h-12 w-full gap-2 rounded-xl bg-rose-500 font-bold text-white hover:bg-rose-400 sm:w-auto sm:min-w-56" data-testid="button-end-live-call">
                      <Phone size={16} className="rotate-[135deg]" /> End call & capture enquiry
                    </Button>
                  )}
                  <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                    {micReady ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Microphone on · tap end call to close</> : <><MicOff size={12} /> Microphone off</>}
                  </p>
                </div>
              </section>
            )}

            {stage === "result" && lead && (
              <section aria-labelledby="result-heading" data-testid="panel-captured-enquiry">
                <div className="mb-5 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#36C6D5]/20 bg-[#36C6D5]/10 text-[#36C6D5]">
                    <CheckCircle2 size={27} />
                  </span>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[.15em] text-[#36C6D5]">Saved to CrewOn</p>
                  <h2 id="result-heading" className="mt-1 text-xl font-bold">Here’s what {receptionistName} captured.</h2>
                  <p className="mt-1 text-xs text-white/45">This live pilot outcome appears in Parsley Electrical’s normal CrewOn office workflow.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#14252C]">
                  <div className="grid grid-cols-2 divide-x divide-y divide-white/8">
                    {[
                      ["Name", lead.name],
                      ["Phone", lead.phone],
                      ["Work needed", lead.workNeeded],
                      ["Urgency", lead.urgency],
                      ["Site address", lead.siteAddress],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</p>
                        <p className="mt-1 break-words text-sm font-medium leading-relaxed text-white/85">{formatField(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/8 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Call summary</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/75">{formatField(lead.summary)}</p>
                  </div>
                </div>
                {booking ? (
                  <div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[.06] p-3.5" data-testid="status-demo-booking">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#83dbe3]">Real appointment booked</p>
                    <p className="mt-1 text-sm font-semibold text-white/85">{booking.slot || demoSlot}</p>
                    <p className="mt-1 text-xs text-white/50">CrewOn job #{booking.jobId ?? lead.jobId ?? "—"} · linked to the saved customer record.</p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/8 bg-white/[.025] p-3.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/40">Booking</p>
                    <p className="mt-1 text-sm text-white/65">No appointment was booked. The call enquiry is still saved for review.</p>
                  </div>
                )}
                <div className="mt-3 rounded-xl border border-[#36C6D5]/15 bg-[#36C6D5]/[.06] p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#83dbe3]">Suggested next action</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/80">{formatField(lead.nextAction)}</p>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={reset} className="gap-2 text-white/65 hover:bg-white/5 hover:text-white" data-testid="button-restart-demo">
                    <RotateCcw size={15} /> Start again
                  </Button>
                  <Button type="button" onClick={() => onOpenChange(false)} className="h-11 gap-2 bg-[#36C6D5] px-5 font-semibold text-[#0D171C] hover:bg-[#58d3de]" data-testid="button-close-enquiry">
                    Done <ArrowRight size={16} />
                  </Button>
                </div>
              </section>
            )}
          </main>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/8 bg-[#0b1418] px-4 py-3 sm:px-6">
            <span className="text-[10px] leading-relaxed text-white/35">OpenAI Realtime · live Parsley pilot · CRM records</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white/40"><ShieldCheck size={12} /> Consent required · no SMS/email sent</span>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

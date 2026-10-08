import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Image as ImageIcon, Mic, Send, Volume2, X } from "lucide-react";
import { voiceCommand, voiceTranscribe } from "@workspace/api-client-react";
import type { VoiceCommandResult } from "@workspace/api-client-react";
import { useVoice } from "@/lib/voice-context";

const ROUTES = ["/dashboard", "/calls", "/jobs", "/assistants", "/contacts", "/quotes", "/invoices", "/certificates", "/email-inbox", "/settings", "/tasks"];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_MS = 60000;
const AFFECTED = ["job", "quote", "invoice", "dashboard", "marketing"];

type Phase = "idle" | "starting" | "listening" | "processing";

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(blob);
  });
}

export default function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [voice, setVoice] = useState<"alloy" | "echo" | "shimmer">("shimmer");

  const qc = useQueryClient();
  const { setQuoteDraft } = useVoice();
  const [, navigate] = useLocation();

  const holding = useRef(false);
  const submitting = useRef(false);
  const gen = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<any>(null);
  const chunks = useRef<Blob[]>([]);
  const srText = useRef("");
  const timer = useRef<number | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const imageRef = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  imageRef.current = image;

  const stopAudio = useCallback(() => {
    if (audioEl.current) { audioEl.current.pause(); audioEl.current = null; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const releaseMedia = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try { recognition.current?.abort(); } catch { /* noop */ }
    recognition.current = null;
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      try { recorder.current.stop(); } catch { /* noop */ }
    }
    recorder.current = null;
    chunks.current = [];
  }, []);

  const play = useCallback((r: VoiceCommandResult) => {
    stopAudio();
    setBlocked(false);
    if (r.audio) {
      const a = new Audio(`data:audio/wav;base64,${r.audio}`);
      audioEl.current = a;
      a.play().catch(() => setBlocked(true));
    } else if ("speechSynthesis" in window && r.spokenResponse) {
      const u = new SpeechSynthesisUtterance(r.spokenResponse);
      u.lang = "en-GB";
      const v = window.speechSynthesis.getVoices().find((x) => x.lang === "en-GB");
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
  }, [stopAudio]);

  const submit = useCallback(async (transcript: string) => {
    const t = transcript.trim();
    if (submitting.current) return;
    if (!t && !imageRef.current) { setPhase("idle"); setError("Nothing to send. Say or type a command, or add a photo."); return; }
    submitting.current = true;
    const g = gen.current;
    setPhase("processing");
    setError(null);
    try {
      const r = await voiceCommand({
        ...(t ? { transcript: t } : {}),
        ...(imageRef.current ? { image: imageRef.current } : {}),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        voice,
      });
      qc.invalidateQueries({
        predicate: (q) => {
          const k = String(q.queryKey[0] ?? "").toLowerCase();
          return AFFECTED.some((a) => k.includes(a));
        },
      });
      if (g !== gen.current) return;
      setResult(r);
      setText("");
      setImage(null);
      setQuoteDraft(r.quoteDraft ?? null);
      play(r);
      if (r.navigateTo && ROUTES.includes(r.navigateTo)) navigate(r.navigateTo);
    } catch (err) {
      const apiError = err as { status?: number; data?: { error?: string } };
      if (g === gen.current) setError(apiError.status === 401
        ? "Sign in as admin in Settings before using voice commands."
        : apiError.data?.error || "The result could not be confirmed. Check the relevant page before trying again. Nothing was retried automatically.");
    } finally {
      submitting.current = false;
      if (g === gen.current) setPhase("idle");
    }
  }, [qc, setQuoteDraft, play, navigate, voice]);

  const finalize = useCallback(async (g: number, blob: Blob | null) => {
    if (g !== gen.current) return;
    let said = srText.current.trim();
    if (!said && blob && blob.size > 0) {
      try {
        const data = await toDataUrl(blob);
        const b64 = data.slice(data.indexOf(",") + 1);
        const r = await voiceTranscribe({ audio: b64 });
        said = (r.transcript || "").trim();
      } catch {
        if (g === gen.current) { setPhase("idle"); setError("Could not make out the recording. Try again or type it instead."); }
        return;
      }
    }
    if (g !== gen.current) return;
    setHeard(said);
    if (!said) { setPhase("idle"); setError("Did not catch anything. Hold the button and speak, or type it."); return; }
    void submit(said);
  }, [submit]);

  const start = useCallback(async () => {
    if (phase !== "idle" || submitting.current || holding.current) return;
    holding.current = true;
    setError(null);
    setResult(null);
    setHeard("");
    stopAudio();
    srText.current = "";
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const canRecord = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    if (!SR && !canRecord) { holding.current = false; setError("Voice input is not supported in this browser. Use the text box instead."); return; }
    setPhase("starting");
    const g = ++gen.current;
    let s: MediaStream | null = null;
    if (canRecord) {
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        if (g === gen.current) {
          holding.current = false; setPhase("idle");
          setError(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "Microphone permission was denied. Allow it in your browser settings, or type instead." : "Could not access a microphone. Type instead.");
        }
        return;
      }
      if (g !== gen.current || !holding.current) {
        s.getTracks().forEach((t) => t.stop());
        if (g === gen.current) setPhase("idle");
        return;
      }
      stream.current = s;
    }
    let recDone = !s;
    let srDone = !SR;
    let finished = false;
    let blob: Blob | null = null;
    const check = () => {
      if (g !== gen.current) return;
      if (recDone && srDone && !finished) {
        finished = true;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null; recorder.current = null; recognition.current = null;
        void finalize(g, blob);
      }
    };
    try {
      if (s) {
        const rec = new MediaRecorder(s);
        chunks.current = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        rec.onstop = () => {
          blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
          chunks.current = [];
          recDone = true;
          check();
          window.setTimeout(() => {
            if (finished || g !== gen.current) return;
            srDone = true; try { recognition.current?.abort(); } catch {} check();
          }, 1500);
        };
        rec.start();
        recorder.current = rec;
      }
      if (SR) {
        const r = new SR();
        r.lang = "en-GB"; r.continuous = true; r.interimResults = false;
        r.onresult = (e: any) => {
          let out = "";
          for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript + " ";
          srText.current = out;
        };
        r.onerror = () => { srText.current = ""; };
        r.onend = () => { srDone = true; check(); };
        // Bound the browser-only path too, in case onend is never dispatched.
        const originalStop = r.stop.bind(r);
        r.stop = () => {
          originalStop();
          window.setTimeout(() => {
            if (finished || g !== gen.current) return;
            srDone = true; try { r.abort(); } catch {} check();
          }, 1500);
        };
        try {
          r.start();
          recognition.current = r;
        } catch {
          srDone = true;
          if (!s) throw new Error("Speech input unavailable");
        }
      }
    } catch {
      releaseMedia(); holding.current = false; setPhase("idle");
      setError("Could not start recording. Type instead.");
      return;
    }
    setPhase("listening");
    timer.current = window.setTimeout(() => stop(), MAX_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, finalize, releaseMedia, stopAudio]);

  const stop = useCallback(() => {
    holding.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!recorder.current && !recognition.current) return;
    setPhase("processing");
    try { recognition.current?.stop(); } catch { /* noop */ }
    if (recorder.current && recorder.current.state !== "inactive") {
      try { recorder.current.stop(); } catch { /* noop */ }
    }
  }, []);

  const cancel = useCallback(() => {
    holding.current = false;
    if (phase === "listening" || phase === "starting") {
      gen.current++;
      releaseMedia();
      setPhase("idle");
    }
  }, [phase, releaseMedia]);

  const close = useCallback(() => {
    gen.current++;
    holding.current = false;
    releaseMedia();
    stopAudio();
    setOpen(false); setPhase("idle"); setText(""); setImage(null);
    setResult(null); setError(null); setHeard(""); setBlocked(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [releaseMedia, stopAudio]);

  useEffect(() => () => {
    gen.current++;
    releaseMedia();
    if (audioEl.current) audioEl.current.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [releaseMedia]);

  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { setError("Photo must be a JPEG, PNG or WebP."); return; }
    if (f.size > MAX_IMAGE) { setError("Photo is over 5MB. Choose a smaller one."); return; }
    try { setImage(await toDataUrl(f)); setError(null); } catch { setError("Could not read that photo."); }
  };

  const busy = phase === "processing" || phase === "starting";
  const label = phase === "listening" ? "Listening. Release to send." : phase === "processing" ? "Working on it" : phase === "starting" ? "Starting microphone" : "Hold to speak";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Voice assistant"
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
          className="w-[calc(100vw-2rem)] max-w-sm rounded-xl border bg-card text-card-foreground shadow-xl p-4 space-y-3 outline-none max-h-[80dvh] overflow-auto"
          data-testid="panel-voice"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Voice assistant</h2>
            <button onClick={close} aria-label="Close voice assistant" className="p-1.5 rounded-md hover:bg-muted" data-testid="button-voice-close">
              <X size={18} />
            </button>
          </div>

          <button
            type="button"
            disabled={busy && phase !== "starting"}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); void start(); }}
            onPointerUp={stop}
            onPointerCancel={cancel}
            onLostPointerCapture={() => { if (holding.current && phase === "starting") cancel(); }}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void start(); } }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stop(); } }}
            onBlur={() => { if (holding.current) cancel(); }}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-4 font-medium select-none touch-none transition-colors ${phase === "listening" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"} disabled:opacity-60`}
            data-testid="button-voice-hold"
          >
            <Mic size={20} /> {label}
          </button>
          <div className="sr-only" role="status" aria-live="polite">{label}</div>

          <div className="space-y-2">
            <label htmlFor="voice-text" className="text-xs font-medium text-muted-foreground">Or type a command</label>
            <div className="flex gap-2">
              <textarea
                id="voice-text"
                rows={2}
                value={text}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase === "idle") void submit(text); } }}
                placeholder="e.g. What's on today's schedule?"
                className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
                data-testid="input-voice-text"
              />
              <button type="button" disabled={phase !== "idle" || (!text.trim() && !image)} onClick={() => void submit(text)} aria-label="Send" className="self-end p-2.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50" data-testid="button-voice-send">
                <Send size={18} />
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Spoken voice
            <select value={voice} onChange={e => setVoice(e.target.value as typeof voice)} className="rounded border bg-background px-2 py-1" disabled={phase !== "idle"}>
              <option value="alloy">Alloy</option>
              <option value="echo">Edward (Echo)</option>
              <option value="shimmer">Shimmer</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 cursor-pointer hover:bg-muted focus-within:ring-2 ring-ring">
              <ImageIcon size={14} /> Photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-voice-photo" />
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 cursor-pointer hover:bg-muted focus-within:ring-2 ring-ring">
              <Camera size={14} /> Camera
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-voice-camera" />
            </label>
            {image && (
              <div className="flex items-center gap-1.5">
                <img src={image} alt="Attached preview" className="h-9 w-9 rounded object-cover border" />
                <button type="button" onClick={() => setImage(null)} className="text-xs underline" data-testid="button-voice-remove-photo">Remove</button>
              </div>
            )}
          </div>

          {heard && <p className="text-xs text-muted-foreground" data-testid="text-voice-heard">Heard: {heard}</p>}
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-voice-error">{error}</p>}
          {result && (
            <div className="rounded-md bg-muted p-3 space-y-2 text-sm" data-testid="text-voice-response">
              <p>{result.spokenResponse}</p>
              {result.quoteDraft && result.quoteDraft.length > 0 && (
                <div>
                  <ul className="list-disc pl-5">
                    {result.quoteDraft.map((m, i) => <li key={i}>{m.quantity} {m.unit} {m.name}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">Please check these quantities. You can edit each one in the quote builder.</p>
                </div>
              )}
              {result.audioError && <p className="text-xs text-muted-foreground">Spoken audio unavailable; reply shown as text.</p>}
              {(blocked || result.audio || ("speechSynthesis" in window)) && (
                <button type="button" onClick={() => play(result)} className="inline-flex items-center gap-1.5 text-xs underline" data-testid="button-voice-replay">
                  <Volume2 size={14} /> {blocked ? "Playback was blocked. Play reply" : "Replay"}
                </button>
              )}
            </div>
          )}

          <p className="text-[11px] leading-snug text-muted-foreground" data-testid="text-voice-privacy">
            Not saved in BuildAI. Your voice, text and photos are processed by AI providers to carry out the command, then discarded here when you close this panel.
          </p>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close voice assistant" : "Open voice assistant"}
        aria-expanded={open}
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-ring ring-offset-2"
        data-testid="button-voice-open"
      >
        <Mic size={24} />
      </button>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Bot, Play, Phone, Zap, X, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Script ───────────────────────────────────────────────────────────────────

export const DEMO_CALL_SCRIPT: { from: "caller" | "oliver"; text: string; pauseMs: number }[] = [
  { from: "caller", text: "Hi there, yeah — I've got a bit of an electrical problem. My kitchen sockets have all stopped working.", pauseMs: 900 },
  { from: "oliver", text: "Good morning! You've reached Parsley Electrical, my name's Oliver. I'm sorry to hear that — sounds frustrating. Can I take your name, please?", pauseMs: 1400 },
  { from: "caller", text: "It's James. James Thornton.", pauseMs: 800 },
  { from: "oliver", text: "Thanks, James. Could I get your postcode so I can confirm we cover your area?", pauseMs: 1000 },
  { from: "caller", text: "Yeah — M14 7JB. Manchester.", pauseMs: 700 },
  { from: "oliver", text: "Perfect, that's well within our area. So all the kitchen sockets have gone dead — have any trip switches on your fuse board flipped?", pauseMs: 1300 },
  { from: "caller", text: "Yeah actually, one's flipped down. Looks like the ring main one.", pauseMs: 900 },
  { from: "oliver", text: "Right, that's helpful. Sounds like a tripped circuit — possibly caused by a faulty appliance. Have you tried switching everything off and resetting the breaker?", pauseMs: 1400 },
  { from: "caller", text: "I did, yeah — but it trips straight back off as soon as I flick it back up.", pauseMs: 1000 },
  { from: "oliver", text: "That tells me there's a fault on the circuit itself. It'll need one of our electricians to come out and run a full test. We can usually get to most Manchester jobs within 24 to 48 hours — shall I book someone in for you?", pauseMs: 1600 },
  { from: "caller", text: "Yes please, as soon as possible if you can.", pauseMs: 800 },
  { from: "oliver", text: "Of course. Are you free tomorrow morning — 8am to 1pm? Or would the afternoon suit better, say 1 to 5?", pauseMs: 1200 },
  { from: "caller", text: "Morning's better for me.", pauseMs: 600 },
  { from: "oliver", text: "Brilliant — I'll book you in for tomorrow, 8am to 1pm. Could I take a mobile number to confirm the appointment?", pauseMs: 1100 },
  { from: "caller", text: "Sure — 07712 345678.", pauseMs: 700 },
  { from: "oliver", text: "Got that. And the full address in M14?", pauseMs: 800 },
  { from: "caller", text: "42 Wilmslow Road, Didsbury.", pauseMs: 700 },
  { from: "oliver", text: "Perfect. So that's 42 Wilmslow Road, Didsbury, M14 7JB. An electrician will be with you tomorrow morning. You'll get a text confirmation shortly, and a reminder the evening before. Is there anything else I can help with?", pauseMs: 1600 },
  { from: "caller", text: "No, that's brilliant. Thank you.", pauseMs: 700 },
  { from: "oliver", text: "Wonderful — we'll see you tomorrow, James. Have a great day!", pauseMs: 1000 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[3, 5, 7, 5, 8, 4, 6, 3, 7, 5].map((h, i) => (
        <div
          key={i}
          className={cn("w-[2px] rounded-full transition-all", active ? "bg-primary" : "bg-white/20")}
          style={{
            height: active ? `${h * 2}px` : "4px",
            animation: active ? `cdmWave ${0.6 + i * 0.07}s ease-in-out infinite alternate` : "none",
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes cdmWave { from { transform: scaleY(0.4); } to { transform: scaleY(1.2); } }
      `}</style>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current opacity-60"
          style={{ animation: `cdmBounce 1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
      <style>{`
        @keyframes cdmBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CallTimer({ running }: { running: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return <span className="font-mono text-sm tabular-nums text-white/80">{m}:{s}</span>;
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

async function fetchAudioBlob(text: string): Promise<string | null> {
  try {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const resp = await fetch(`${base}/api/assistants/voice-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "onyx", text }),
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function CallDemoModal({
  open,
  onOpenChange,
  autoPlay = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoPlay?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingFrom, setTypingFrom] = useState<"caller" | "oliver" | null>(null);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Map from script index → blob URL (for Oliver lines only)
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  const clearAll = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
  };

  const reset = () => {
    clearAll();
    // revoke old blob URLs
    audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    setVisibleCount(0);
    setTypingFrom(null);
    setStarted(false);
    setFinished(false);
    setAudioReady(false);
  };

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) currentAudioRef.current?.pause();
  }, [muted]);

  useEffect(() => {
    if (!open) { reset(); return undefined; }
    if (autoPlay) {
      const t = setTimeout(startDemo, 350);
      return () => clearTimeout(t);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleCount, typingFrom]);

  function playAudio(index: number) {
    if (mutedRef.current) return;
    const url = audioCacheRef.current.get(index);
    if (!url) return;
    currentAudioRef.current?.pause();
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    audio.play().catch(() => {});
  }

  async function prefetchAllOliverAudio() {
    const oliverLines = DEMO_CALL_SCRIPT
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.from === "oliver");

    // Fetch all in parallel
    await Promise.all(
      oliverLines.map(async ({ item, i }) => {
        const url = await fetchAudioBlob(item.text);
        if (url) audioCacheRef.current.set(i, url);
      })
    );
    setAudioReady(true);
  }

  function startDemo() {
    setStarted(true);
    // kick off audio pre-fetch in background (don't await — let it load while text plays)
    prefetchAllOliverAudio();

    let cursor = 0;

    const schedule = (index: number) => {
      if (index >= DEMO_CALL_SCRIPT.length) {
        const t = setTimeout(() => setFinished(true), 600);
        timeoutsRef.current.push(t);
        return;
      }
      const item = DEMO_CALL_SCRIPT[index];
      const t1 = setTimeout(() => setTypingFrom(item.from), cursor);
      cursor += item.pauseMs;
      const t2 = setTimeout(() => {
        setTypingFrom(null);
        setVisibleCount(index + 1);
        if (item.from === "oliver") playAudio(index);
        schedule(index + 1);
      }, cursor);
      cursor += 400;
      timeoutsRef.current.push(t1, t2);
    };

    schedule(0);
  }

  const activeOliver =
    typingFrom === "oliver" ||
    (visibleCount > 0 && DEMO_CALL_SCRIPT[visibleCount - 1]?.from === "oliver" && !typingFrom);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] p-0 overflow-hidden gap-0 rounded-2xl translate-y-[-50%]">
        {/* ── Phone call header ── */}
        <div className="relative bg-gradient-to-b from-[#0d1117] to-[#1a2332] px-5 pt-5 pb-4">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors p-1"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="relative w-11 h-11 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Bot size={20} className="text-primary" />
              {started && !finished && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0d1117] animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold leading-none">Oliver</p>
              <p className="text-white/50 text-xs mt-1">AI Phone Operator · Parsley Electrical</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {started && !finished ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/30">
                  Live
                </span>
              ) : finished ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  Ended
                </span>
              ) : null}
              {started && (
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="text-white/50 hover:text-white transition-colors p-1"
                  title={muted ? "Unmute Oliver" : "Mute Oliver"}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
            <Phone size={12} className="text-white/50 shrink-0" />
            <span className="text-white/70 text-xs truncate flex-1">Inbound · Kitchen socket fault · Manchester M14</span>
            <Waveform active={started && !finished && activeOliver && !muted} />
            <CallTimer running={started && !finished} />
          </div>
        </div>

        {/* ── Transcript ── */}
        <div className="bg-[#f8f9fa] h-[42vh] max-h-[340px] min-h-[200px] overflow-y-auto px-4 py-4 space-y-3">
          {!started && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-semibold text-secondary text-sm">Electrical Enquiry · Live Demo</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  Watch Oliver handle a real kitchen socket fault call, qualify the lead, and book the job — with voice.
                </p>
              </div>
              <Button size="sm" className="gap-2 mt-1" onClick={startDemo}>
                <Play size={13} /> Play Demo Call
              </Button>
            </div>
          )}

          {DEMO_CALL_SCRIPT.slice(0, visibleCount).map((msg, i) => {
            const isOliver = msg.from === "oliver";
            return (
              <div
                key={i}
                className={cn("flex gap-2", isOliver ? "justify-end" : "justify-start")}
                style={{ animation: "cdmFadeIn 0.3s ease-out forwards" }}
              >
                {!isOliver && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Phone size={12} className="text-slate-500" />
                  </div>
                )}
                <div className={cn("max-w-[78%] flex flex-col", isOliver ? "items-end" : "items-start")}>
                  <span className={cn("text-[10px] font-semibold px-1 mb-0.5", isOliver ? "text-primary" : "text-slate-500")}>
                    {isOliver ? "Oliver" : "Caller"}
                  </span>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                      isOliver
                        ? "bg-[#1a2332] text-white rounded-tr-sm"
                        : "bg-white text-slate-800 rounded-tl-sm border border-slate-200"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
                {isOliver && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={12} className="text-primary" />
                  </div>
                )}
              </div>
            );
          })}

          {typingFrom && (
            <div className={cn("flex gap-2", typingFrom === "oliver" ? "justify-end" : "justify-start")}>
              {typingFrom === "caller" && (
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <Phone size={12} className="text-slate-500" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl shadow-sm",
                  typingFrom === "oliver"
                    ? "bg-[#1a2332] text-white rounded-tr-sm"
                    : "bg-white text-slate-400 rounded-tl-sm border border-slate-200"
                )}
              >
                <TypingDots />
              </div>
              {typingFrom === "oliver" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot size={12} className="text-primary" />
                </div>
              )}
            </div>
          )}

          {finished && (
            <div className="flex justify-center pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-white border rounded-full px-3 py-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Call ended · Job booked for tomorrow 8am–1pm
              </div>
            </div>
          )}

          <div ref={bottomRef} />
          <style>{`
            @keyframes cdmFadeIn {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <Bot size={12} className="text-primary shrink-0" />
            <span className="truncate">Oliver · <span className="font-medium text-secondary">onyx</span> voice
              {started && !audioReady && !finished && (
                <span className="text-muted-foreground/60"> · loading audio…</span>
              )}
            </span>
          </div>
          {finished ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 shrink-0 ml-2" onClick={reset}>
              <Play size={11} /> Replay
            </Button>
          ) : !started ? (
            <Button size="sm" className="h-7 text-xs gap-1.5 shrink-0 ml-2" onClick={startDemo}>
              <Play size={11} /> Play
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

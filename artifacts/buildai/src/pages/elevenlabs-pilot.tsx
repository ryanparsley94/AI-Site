import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ArrowLeft, Headphones, Mic, MicOff, PhoneOff, ShieldCheck } from "lucide-react";

type ConnectionStatus = { configured: boolean; mode: string; message: string };

function PilotConversation() {
  const conversation = useConversation();
  const [setup, setSetup] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/voice/elevenlabs/status", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Sign in to CREWON to try the pilot.");
      const data = await response.json() as ConnectionStatus;
      if (!controller.signal.aborted) setSetup(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Couldn't check the ElevenLabs connection. Sign in and try again.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function start() {
    if (starting || conversation.status !== "disconnected" || !setup?.configured) return;
    setStarting(true);
    setError("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone conversations require HTTPS. Use CREWON's secure address.");
      }
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach((track) => track.stop());
      const response = await fetch("/api/voice/elevenlabs/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const body = await response.json() as { signedUrl?: string; error?: string };
      if (!response.ok || !body.signedUrl) throw new Error(body.error || "The call couldn't start.");
      // Private ElevenLabs agent; the short-lived URL is fetched only when the
      // signed-in pilot explicitly starts a conversation, never at page load.
      await conversation.startSession({ signedUrl: body.signedUrl });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call couldn't start.");
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    try { await conversation.endSession(); }
    catch { setError("Could not end the session cleanly. Refresh to disconnect."); }
  }

  const connected = conversation.status === "connected";
  const busy = starting || conversation.status === "connecting";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <Link href="/assistants" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 font-semibold text-primary hover:bg-muted">
        <ArrowLeft size={20} /> Back to AI assistants
      </Link>
      <header className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <ShieldCheck size={15} /> Signed-in CREWON pilot only
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ElevenLabs receptionist pilot</h1>
        <p className="text-muted-foreground">
          Compare natural, real-time speech with the existing CREWON receptionist.
          This is a separate test: it does not yet book jobs, write to your CRM or answer your live Twilio number.
        </p>
      </header>
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-label="ElevenLabs pilot call">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Headphones size={28} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Voice test</h2>
            <p className="text-sm text-muted-foreground" role="status" data-testid="elevenlabs-pilot-status">
              {connected
                ? (conversation.isSpeaking ? "Receptionist speaking" : "Connected — listening")
                : busy ? "Connecting…" : loading ? "Checking setup…" : setup?.configured ? "Ready to start" : "Setup needed"}
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-xl bg-muted/40 p-4 text-sm">
          {loading ? "Checking ElevenLabs account setup…" : setup?.message || "Connection unavailable."}
        </div>
        {error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-testid="elevenlabs-start"
            onClick={() => void start()}
            disabled={loading || !setup?.configured || busy || connected}
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Mic size={24} /> {busy ? "Connecting…" : "Start voice test"}
          </button>
          <button
            type="button"
            data-testid="elevenlabs-stop"
            onClick={() => void stop()}
            disabled={!connected && !busy}
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl border-2 bg-background px-5 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PhoneOff size={24} /> End call
          </button>
        </div>
        {connected && (
          <button type="button"
            onClick={() => conversation.setMuted(!conversation.isMuted)}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold">
            {conversation.isMuted ? <MicOff size={19} /> : <Mic size={19} />}
            {conversation.isMuted ? "Unmute microphone" : "Mute microphone"}
          </button>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        Pilot conversations may consume ElevenLabs credits. Test with fictitious customers, not real personal data.
        No recording or CRM sync is enabled by CREWON on this pilot page; check recording settings inside ElevenLabs separately.
        Choose your British voice, speaking pace, interruptions and conversational model in the ElevenLabs agent dashboard.
      </p>
    </div>
  );
}

export default function ElevenLabsPilotPage() {
  return (
    <ConversationProvider>
      <PilotConversation />
    </ConversationProvider>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { calculateQuote, type QuoteWorkflow } from "@workspace/api-zod";
import { AlertTriangle, Check, CircleHelp, Mic, MicOff, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PreviewResult = {
  workflow: QuoteWorkflow;
  warnings: string[];
  priceReviewRequired: boolean;
};

type Message =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      summary: string;
      changes: string[];
      warnings: string[];
      priceReviewRequired: boolean;
      proposal?: boolean;
      outcome?: "accepted" | "discarded";
    };

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = ArrayLike<SpeechAlternativeLike> & { isFinal?: boolean };
type SpeechResultEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
};
type SpeechErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

type PendingProposal = {
  workflow: QuoteWorkflow;
  messageId: number;
};

const fieldLabels: Array<[keyof QuoteWorkflow, string]> = [
  ["customerName", "Customer"],
  ["customerEmail", "Email"],
  ["customerPhone", "Phone"],
  ["billingAddress", "Billing address"],
  ["siteAddress", "Site address"],
  ["scope", "Scope"],
  ["assumptions", "Assumptions"],
  ["exclusions", "Exclusions"],
  ["paymentTerms", "Payment terms"],
  ["validUntil", "Validity date"],
  ["vatRegistered", "VAT registration"],
  ["vatNumber", "VAT number"],
  ["vatPercent", "VAT rate"],
  ["deposit", "Deposit"],
  ["sections", "Work and pricing"],
];

function getTotals(workflow: QuoteWorkflow) {
  try { return calculateQuote(workflow); } catch { return null; }
}

const gbp = (amount: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

function summarizeChanges(before: QuoteWorkflow, after: QuoteWorkflow): string[] {
  const changed = fieldLabels
    .filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(([, label]) => label);

  if (changed.length === 0) return ["No differences detected in the quote."];
  return changed.slice(0, 5).concat(changed.length > 5 ? [`+${changed.length - 5} more areas`] : []);
}

function getSpeechConstructor(): SpeechRecognitionConstructorLike | undefined {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export type AiQuoteChatProps = {
  workflow: QuoteWorkflow;
  busy: boolean;
  onPreview: (instruction: string) => Promise<PreviewResult>;
  onAccept: (workflow: QuoteWorkflow) => Promise<void>;
};

export function AiQuoteChat({ workflow, busy, onPreview, onAccept }: AiQuoteChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const nextId = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const speechSupported = typeof window !== "undefined" && !!getSpeechConstructor();
  const blocked = busy || isPreviewing || isApplying || !!pending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, isPreviewing]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const submitInstruction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = input.trim();
    if (!instruction || blocked) return;

    setInput("");
    setRequestError("");
    setSpeechError("");
    setMessages(current => [...current, { id: nextId.current++, role: "user", text: instruction }]);
    setIsPreviewing(true);
    try {
      const result = await onPreview(instruction);
      const messageId = nextId.current++;
      setMessages(current => [
        ...current,
        {
          id: messageId,
          role: "assistant",
          summary: "A draft preview is ready. Review the proposed changes before applying them.",
          changes: summarizeChanges(workflow, result.workflow),
          warnings: result.warnings,
          priceReviewRequired: result.priceReviewRequired,
          proposal: true,
        },
      ]);
      setPending({ workflow: result.workflow, messageId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "The preview could not be prepared. Try again.";
      setRequestError(message);
      setMessages(current => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          summary: "I couldn’t prepare a preview. Your draft has not been changed.",
          changes: [],
          warnings: [],
          priceReviewRequired: false,
        },
      ]);
    } finally {
      setIsPreviewing(false);
    }
  };

  const acceptProposal = async () => {
    if (!pending) return;
    setIsApplying(true);
    setRequestError("");
    try {
      await onAccept(pending.workflow);
    } catch (error: unknown) {
      setRequestError(error instanceof Error ? error.message : "The revision could not be saved. Your current draft is unchanged.");
      setIsApplying(false);
      return;
    }
    setMessages(current => current.map(message =>
      message.id === pending.messageId && message.role === "assistant"
        ? { ...message, proposal: false, outcome: "accepted" }
        : message,
    ));
    setPending(null);
    setIsApplying(false);
  };

  const discardProposal = () => {
    if (!pending) return;
    setMessages(current => current.map(message =>
      message.id === pending.messageId && message.role === "assistant"
        ? { ...message, proposal: false, outcome: "discarded" }
        : message,
    ));
    setPending(null);
  };

  const toggleDictation = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = getSpeechConstructor();
    if (!SpeechRecognition) return;

    setSpeechError("");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = event => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      if (transcript) setInput(current => `${current}${current && !current.endsWith(" ") ? " " : ""}${transcript}`);
    };
    recognition.onerror = event => {
      setIsListening(false);
      setSpeechError(event.error === "not-allowed"
        ? "Microphone permission was denied."
        : "Dictation stopped. You can type your instruction instead.");
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      setSpeechError("Dictation could not start. You can type your instruction instead.");
    }
  };

  return (
    <section
      className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
      aria-labelledby="ai-quote-chat-title"
      data-testid="ai-quote-chat"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-primary/[0.10] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="ai-quote-chat-title" className="font-semibold tracking-tight text-secondary">AI quote editor</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Make a change by asking. Nothing is applied until you accept it.
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          Draft only
        </span>
      </header>

      <div className="max-h-[min(46vh,420px)] min-h-32 space-y-4 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && !isPreviewing && (
          <div className="mx-auto flex max-w-sm flex-col items-center px-3 py-5 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.08] text-primary">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-secondary">What would you like to change?</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Try “add removal of the old basin to the scope” or “change the quote validity to 30 days”.
            </p>
          </div>
        )}

        {messages.map(message => message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[88%] rounded-2xl rounded-br-sm border border-primary/20 bg-primary/[0.10] px-3.5 py-2.5 text-sm leading-relaxed text-secondary sm:max-w-[78%]">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">You</p>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        ) : (
          <div key={message.id} className="flex justify-start">
            <div className={`w-full max-w-[94%] rounded-2xl rounded-bl-sm border px-3.5 py-3 sm:max-w-[88%] ${message.priceReviewRequired ? "border-amber-400/45 bg-amber-400/[0.06]" : "border-border bg-background/60"}`}>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> CREWON AI
              </div>
              <p className="text-sm leading-relaxed text-secondary">{message.summary}</p>
              {message.changes.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Changed areas</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {message.changes.map(change => (
                      <li key={change} className="rounded-md border border-border/80 bg-card px-2 py-1 text-xs text-secondary">{change}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.proposal && pending?.messageId === message.id && (
                <div className="mt-3 rounded-lg border border-primary/20 bg-card/60 p-3" data-testid="ai-quote-proposal-details">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Proposed quote — review before applying</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-secondary">{pending.workflow.scope || "No scope text"}</p>
                  <div className="mt-3 space-y-3">
                    {pending.workflow.sections.map(section => (
                      <div key={section.id}>
                        <p className="text-xs font-semibold text-secondary">{section.title}</p>
                        {section.items.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No line items</p> : (
                          <ul className="mt-1 divide-y divide-border/60">
                            {section.items.map(item => (
                              <li key={item.id} className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:items-start sm:justify-between">
                                <span className="min-w-0 break-words text-secondary">{item.description}<span className="ml-1 text-muted-foreground">· {item.quantity} {item.unit}</span></span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">Cost {gbp(item.costPrice)} · Sell {gbp(item.sellPrice)} / {item.unit}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1 border-t border-border/70 pt-2 text-xs sm:grid-cols-2">
                    <p>Assumptions: {pending.workflow.assumptions || "None stated"}</p>
                    <p>Exclusions: {pending.workflow.exclusions || "None stated"}</p>
                    {(() => {
                      const totals = getTotals(pending.workflow);
                      return totals ? (
                        <div className="sm:col-span-2 rounded-md bg-background/70 p-2 tabular-nums">
                          <p>Subtotal {gbp(totals.subtotal)} · VAT {gbp(totals.vatAmount)}</p>
                          <p className="mt-0.5 font-semibold text-secondary">Total {gbp(totals.total)} · Deposit {gbp(totals.depositAmount)} · Balance {gbp(totals.balance)}</p>
                        </div>
                      ) : <p className="sm:col-span-2 text-amber-200">Totals need review before this proposal can be applied.</p>;
                    })()}
                  </div>
                </div>
              )}
              {message.priceReviewRequired && (
                <div className="mt-3 flex gap-2 rounded-lg border border-amber-400/40 bg-amber-400/[0.09] p-2.5 text-xs leading-relaxed text-amber-100" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                  <span><strong className="font-semibold">Price review required.</strong> Check every affected line and total before accepting.</span>
                </div>
              )}
              {message.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5" role="note" aria-label="Preview warnings">
                  {message.warnings.map((warning, index) => (
                    <p key={`${message.id}-warning-${index}`} className="flex gap-2 text-xs leading-relaxed text-amber-200/90">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{warning}
                    </p>
                  ))}
                </div>
              )}
              {message.outcome && (
                <p className={`mt-3 flex items-center gap-1.5 border-t border-border/70 pt-2 text-xs ${message.outcome === "accepted" ? "text-primary" : "text-muted-foreground"}`}>
                  {message.outcome === "accepted" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
                  {message.outcome === "accepted" ? "Changes accepted into the draft." : "Proposal discarded. The draft is unchanged."}
                </p>
              )}
              {message.proposal && pending?.messageId === message.id && (
                <div className="mt-3 flex flex-col-reverse gap-2 border-t border-border/70 pt-3 min-[390px]:flex-row min-[390px]:justify-end">
                  <Button type="button" variant="outline" className="h-10" onClick={discardProposal} disabled={isApplying} aria-label="Discard proposed quote changes">
                    <X className="mr-1.5 h-4 w-4" aria-hidden="true" />Discard
                  </Button>
                  <Button type="button" className="h-10" onClick={acceptProposal} disabled={isApplying} aria-label="Accept proposed quote changes">
                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />{isApplying ? "Saving revision…" : "Accept changes"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isPreviewing && (
          <div className="flex justify-start" role="status" aria-label="Preparing quote preview">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3.5 py-3 text-xs text-muted-foreground">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
              </span>
              Preparing a reviewable preview…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {(requestError || speechError) && (
        <p className="mx-3 mb-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:mx-5" role="alert">
          {requestError || speechError}
        </p>
      )}

      <form onSubmit={submitInstruction} className="border-t border-border/70 bg-background/35 p-3 sm:p-4">
        <label htmlFor="ai-quote-instruction" className="sr-only">Instruction for quote changes</label>
        <div className={`rounded-xl border bg-background/60 p-2 transition-colors focus-within:border-primary/55 ${pending ? "border-amber-400/30 opacity-75" : "border-input"}`}>
          <Textarea
            id="ai-quote-instruction"
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={pending ? "Accept or discard this preview to continue…" : "Describe a change to this draft…"}
            className="min-h-[66px] resize-y border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            maxLength={2000}
            disabled={blocked}
            aria-describedby="ai-quote-input-hint"
            data-testid="input-ai-quote-instruction"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-1 pt-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              {speechSupported ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-2 ${isListening ? "text-primary" : "text-muted-foreground"}`}
                  onClick={toggleDictation}
                  disabled={blocked}
                  aria-pressed={isListening}
                  aria-label={isListening ? "Stop dictation" : "Dictate instruction"}
                  title={isListening ? "Stop dictation" : "Dictate instruction"}
                  data-testid="button-ai-quote-dictate"
                >
                  {isListening ? <MicOff className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                  {isListening ? "Stop" : "Dictate"}
                </Button>
              ) : (
                <span className="px-2">Dictation unavailable in this browser</span>
              )}
              <span id="ai-quote-input-hint" className="hidden sm:inline">Enter to preview · Shift + Enter for a new line</span>
            </div>
            <Button type="submit" className="h-9" disabled={blocked || !input.trim()} data-testid="button-ai-quote-preview">
              {isPreviewing ? <RotateCcw className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Preview change
            </Button>
          </div>
        </div>
        <p className="mt-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
          AI suggestions stay in this editor. They never send or accept a quote for you.
        </p>
      </form>
    </section>
  );
}

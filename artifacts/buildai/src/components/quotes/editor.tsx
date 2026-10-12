import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuote, useUpdateQuote, useDuplicateQuote, useConvertQuoteToInvoice, useConvertQuoteToJob,
  getListQuotesQueryKey, getListJobsQueryKey, getListInvoicesQueryKey, getGetDashboardSummaryQueryKey, getGetQuoteQueryKey,
  type Company, type Quote,
} from "@workspace/api-client-react";
import type { QuoteWorkflow } from "@workspace/api-zod";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, CheckCircle2, Copy, Download, Lock, Receipt, Save, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { DetailsForm } from "./details-form";
import { SectionsEditor } from "./sections-editor";
import { TotalsPanel } from "./totals-panel";
import { AiPricing } from "./ai-pricing";
import { AiQuoteChat } from "./ai-quote-chat";
import { CustomerPreview, TemplateControls, type PreviewTemplate } from "./customer-preview";
import { downloadQuotePdf } from "./pdf";
import { normalizeWorkflow, reviewIssues, safeCalc, statusLabel, storedTotal } from "./helpers";

export type EditorInit = {
  quote: Quote | null; workflow: QuoteWorkflow; title: string;
  contactId?: number | null; callId?: number | null; jobId?: number | null;
  notices?: string[]; legacyOldTotal?: number;
};

const errMsg = (e: unknown, fb: string) => {
  const x = e as { status?: number; data?: { error?: string }; message?: string };
  if (x?.status === 409) return "This quote was changed elsewhere. Reload it before saving.";
  return x?.data?.error || x?.message || fb;
};

export function QuoteEditor({ init, company, onBack, onOpen }: {
  init: EditorInit; company?: Company | null; onBack: () => void; onOpen: (q: Quote) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [quote, setQuote] = useState<Quote | null>(init.quote);
  const [w, setW] = useState<QuoteWorkflow>(init.workflow);
  const [title, setTitle] = useState(init.title);
  const [saved, setSaved] = useState(() => JSON.stringify([init.workflow, init.title]));
  const [tab, setTab] = useState<"internal" | "customer">("internal");
  const [showPreview, setShowPreview] = useState(false);
  const [cmpTpl, setCmpTpl] = useState<PreviewTemplate | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [quoteHistory, setQuoteHistory] = useState<Array<{ revision: number; title: string; status: string; workflow: QuoteWorkflow; totalIncVat: number | null; createdAt: string }>>([]);
  const create = useCreateQuote();
  const update = useUpdateQuote();
  const dup = useDuplicateQuote();
  const toInvoice = useConvertQuoteToInvoice();
  const toJob = useConvertQuoteToJob();

  const status = quote?.status ?? "draft";
  const locked = status === "accepted";
  const dirty = JSON.stringify([w, title]) !== saved || (!quote && true);
  const { calc, error } = useMemo(() => safeCalc(w), [w]);
  const issues = useMemo(() => reviewIssues(w, calc, error), [w, calc, error]);
  const effective = locked ? "accepted" : dirty ? "draft" : status;
  const busy = create.isPending || update.isPending || dup.isPending || toInvoice.isPending || toJob.isPending;
  const editableSavedQuote = !!quote && !locked && ["draft", "reviewed", "changes_requested"].includes(status);

  const loadHistory = async (quoteId: number) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/quotes/${quoteId}/history`, { credentials: "include" });
      if (response.ok) setQuoteHistory(await response.json());
    } catch {
      // History is supplementary; the quote remains editable if it cannot be loaded.
    }
  };
  useEffect(() => {
    if (quote?.id) void loadHistory(quote.id);
  }, [quote?.id]);

  const requestAiPreview = async (instruction: string) => {
    if (!quote) throw new Error("Save this quote as a draft before using the AI editor.");
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/quotes/${quote.id}/ai-edit/preview`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, revision: quote.revision }),
    });
    const result = await response.json() as { workflow?: QuoteWorkflow; warnings?: string[]; priceReviewRequired?: boolean; error?: string };
    if (!response.ok || !result.workflow) throw new Error(result.error || "Could not prepare an AI quote preview.");
    return { workflow: result.workflow, warnings: result.warnings ?? [], priceReviewRequired: result.priceReviewRequired === true };
  };

  const acceptAiRevision = async (workflow: QuoteWorkflow) => {
    if (!quote || locked) throw new Error("This quote is no longer editable. Reload it before applying the proposal.");
    const updated = await update.mutateAsync({ id: quote.id, data: { workflow: workflow as never, materials: [], revision: quote.revision } });
    adopt(updated);
    refresh();
    await loadHistory(updated.id);
    toast({ title: "AI edit saved as a new quote revision" });
  };

  const refresh = (all = false) => {
    qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    if (quote) qc.invalidateQueries({ queryKey: getGetQuoteQueryKey(quote.id) });
    if (all) {
      qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    }
  };
  const adopt = (q: Quote) => {
    setQuote(q);
    const nw = normalizeWorkflow(q.workflow as unknown as QuoteWorkflow);
    setW(nw); setTitle(q.title);
    setSaved(JSON.stringify([nw, q.title]));
  };
  const save = (markReviewed = false) => {
    if (!title.trim()) { toast({ title: "Give the quote a title first", variant: "destructive" }); return; }
    if (markReviewed && issues.length) { toast({ title: "Complete the review checklist first", variant: "destructive" }); return; }
    const done = (q: Quote) => { adopt(q); refresh(); toast({ title: markReviewed ? "Quote marked reviewed" : "Quote saved" }); };
    const fail = (e: unknown) => toast({ title: errMsg(e, "Could not save the quote"), variant: "destructive" });
    if (!quote) {
      create.mutate({ data: { title, workflow: w as never, materials: [], contactId: init.contactId ?? null, callId: init.callId ?? null, jobId: init.jobId ?? undefined, ...(markReviewed ? { status: "reviewed" as const } : {}) } }, { onSuccess: done, onError: fail });
    } else {
      update.mutate({ id: quote.id, data: { title, workflow: w as never, materials: [], revision: quote.revision, ...(markReviewed ? { status: "reviewed" as const } : {}) } }, { onSuccess: done, onError: fail });
    }
  };
  const accept = () => {
    if (!quote || dirty || status !== "reviewed") return;
    if (!window.confirm("Accept this quote? It becomes locked. To change it later you must duplicate it.")) return;
    update.mutate({ id: quote.id, data: { status: "accepted", revision: quote.revision } }, {
      onSuccess: q => { adopt(q); refresh(); toast({ title: "Quote accepted and locked" }); },
      onError: e => toast({ title: errMsg(e, "Could not accept"), variant: "destructive" }),
    });
  };
  const duplicate = () => {
    if (!quote) return;
    dup.mutate({ id: quote.id }, { onSuccess: q => { refresh(); toast({ title: "Duplicated as a new draft" }); onOpen(q); }, onError: e => toast({ title: errMsg(e, "Could not duplicate"), variant: "destructive" }) });
  };
  const pdf = async () => {
    if (!calc) { toast({ title: error ?? "Fix the quote values first", variant: "destructive" }); return; }
    const draft = effective === "draft";
    if (!draft && !window.confirm("Confirm you have reviewed the scope, lines, prices, VAT and terms before downloading this customer document.")) return;
    try {
      const co = locked && quote?.companySnapshot ? quote.companySnapshot : company;
      await downloadQuotePdf({ id: quote?.id, title, createdAt: quote?.createdAt, workflow: w, calc, company: co, draft });
    } catch { toast({ title: "Could not generate the PDF", variant: "destructive" }); }
  };
  const makeInvoice = () => {
    if (!quote) return;
    toInvoice.mutate({ id: quote.id }, { onSuccess: () => { refresh(true); toast({ title: "Invoice created from this quote" }); }, onError: e => toast({ title: errMsg(e, "Could not create invoice"), variant: "destructive" }) });
  };
  const makeJob = () => {
    if (!quote) return;
    if (!when) { toast({ title: "Choose a date and time", variant: "destructive" }); return; }
    toJob.mutate({ id: quote.id, data: { scheduledAt: new Date(when).toISOString() } }, {
      onSuccess: () => { setJobOpen(false); refresh(true); toast({ title: "Job ready from this quote" }); },
      onError: e => toast({ title: errMsg(e, "Could not create job"), variant: "destructive" }),
    });
  };

  const refText = quote ? `Q-${quote.id}` : "Unsaved";
  const brandCo = locked && quote?.companySnapshot ? quote.companySnapshot : company;
  const previewEl = (
    <div className="space-y-3" data-testid="live-preview">
      <TemplateControls saved={brandCo?.quoteTemplate} value={cmpTpl} onChange={setCmpTpl} locked={locked} />
      <CustomerPreview w={w} calc={calc} error={error} company={brandCo} title={title} refText={refText} draft={effective === "draft"} createdAt={quote?.createdAt} template={locked ? null : cmpTpl} />
    </div>
  );
  return (
    <div className="space-y-4 p-4 pb-28 sm:p-6" data-testid="quote-editor">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" className="h-11" onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }} data-testid="button-back-quotes"><ArrowLeft className="mr-1 h-4 w-4" />Quotes</Button>
        <h1 className="text-xl font-bold tracking-tight text-secondary">{title || "Untitled quote"}</h1>
        <Badge variant="outline" data-testid="badge-quote-status">{locked && <Lock className="mr-1 h-3 w-3" />}{statusLabel(effective, quote?.sharedAt)}{dirty && quote ? " (unsaved changes)" : ""}</Badge>
        <span className="text-xs text-muted-foreground">{refText}</span>
      </div>

      {(init.notices ?? []).map((n, i) => <p key={i} className="flex gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200" data-testid={`notice-${i}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{n}</p>)}
      {init.legacyOldTotal !== undefined && !quote?.workflow && calc && (
        <p className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200" data-testid="notice-legacy">
          Older quote. Rebuilt lines are an approximation: stored total {formatCurrency(init.legacyOldTotal)}, rebuilt total {formatCurrency(calc.total)}
          {Math.abs(init.legacyOldTotal - calc.total) > 0.005 ? ". These differ, so check every line before saving." : "."} Nothing is rewritten until you save.
        </p>
      )}
      {quote?.status === "changes_requested" && quote.changeRequest && <p className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm" data-testid="notice-change-request">Client requested changes: {quote.changeRequest}</p>}
      {locked && <p className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm" data-testid="notice-locked">Accepted quotes are read-only. Duplicate it to make changes.</p>}
      {quote && status === "reviewed" && dirty && <p className="text-sm text-amber-300">Saving edits to a reviewed quote returns it to draft.</p>}

      <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-border p-0.5">
        {(["internal", "customer"] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} data-testid={`tab-${t}`} className={`h-10 rounded px-4 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t === "internal" ? "Internal" : "Customer view"}</button>
        ))}
      </div>
      {tab === "internal" && <Button type="button" variant="outline" className="h-10" onClick={() => setShowPreview(v => !v)} aria-pressed={showPreview} data-testid="button-toggle-live-preview">{showPreview ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}{showPreview ? "Hide live preview" : "Show live preview"}</Button>}
      </div>

      {tab === "customer" ? previewEl : (
        <div className={showPreview ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]" : ""}>
          <fieldset disabled={locked} className={`grid min-w-0 gap-4 ${showPreview ? "" : "lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
            <div className="min-w-0 space-y-4">
              <DetailsForm w={w} onChange={setW} title={title} onTitle={setTitle} />
              <SectionsEditor w={w} onChange={setW} calc={calc} />
              {!locked && <AiPricing w={w} onChange={setW} />}
              {editableSavedQuote && !dirty && (
                <AiQuoteChat workflow={w} busy={busy} onPreview={requestAiPreview} onAccept={acceptAiRevision} />
              )}
              {editableSavedQuote && dirty && (
                <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
                  Save the current draft before asking the AI to edit it. Unsaved changes are not included in AI previews.
                </p>
              )}
              {quote && quoteHistory.length > 0 && (
                <details className="rounded-lg border border-border bg-card/50 px-4 py-3" data-testid="quote-version-history">
                  <summary className="cursor-pointer text-sm font-semibold text-secondary">Quote history ({quoteHistory.length} saved {quoteHistory.length === 1 ? "version" : "versions"})</summary>
                  <ol className="mt-3 space-y-2">
                    {quoteHistory.map(version => (
                      <li key={version.revision} className="border-t border-border/60 pt-2 text-xs">
                        <details>
                          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                            <span>Revision {version.revision} · {version.status}</span>
                            <span>{version.totalIncVat == null ? "Total not recorded" : formatCurrency(version.totalIncVat)}</span>
                            <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString("en-GB")}</time>
                          </summary>
                          <div className="mt-2 space-y-2 rounded-md bg-background/50 p-3">
                            <p className="whitespace-pre-wrap">{version.workflow.scope}</p>
                            {version.workflow.sections.map(section => (
                              <div key={section.id}>
                                <p className="font-semibold">{section.title}</p>
                                <ul className="mt-1 list-disc space-y-1 pl-4">
                                  {section.items.map(item => <li key={item.id}>{item.description} — {item.quantity} {item.unit} at {formatCurrency(item.sellPrice)} each</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <TotalsPanel w={w} onChange={setW} calc={calc} error={error} />
              {!locked && (
                <div className="rounded-lg border border-border bg-card/60 p-4 text-sm" data-testid="review-checklist">
                  <p className="mb-2 font-semibold text-secondary">Before marking reviewed</p>
                  {issues.length === 0 ? <p className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-4 w-4" />Ready to review</p>
                    : <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{issues.map(i => <li key={i}>{i}</li>)}</ul>}
                </div>
              )}
            </div>
          </fieldset>
          {showPreview && <aside className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:self-start xl:overflow-y-auto">{previewEl}</aside>}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur md:left-[var(--sidebar-width,0px)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          {!locked && <Button className="h-11" onClick={() => save(false)} disabled={busy || (!dirty && !!quote)} data-testid="button-save-quote"><Save className="mr-1.5 h-4 w-4" />Save draft</Button>}
          {!locked && <Button variant="outline" className="h-11" onClick={() => save(true)} disabled={busy || issues.length > 0} data-testid="button-mark-reviewed"><CheckCircle2 className="mr-1.5 h-4 w-4" />Mark reviewed</Button>}
          {!locked && <Button variant="outline" className="h-11" onClick={accept} disabled={busy || !quote || dirty || status !== "reviewed"} data-testid="button-accept-quote">Accept</Button>}
          <Button variant="outline" className="h-11" onClick={pdf} disabled={!calc} data-testid="button-download-pdf"><Download className="mr-1.5 h-4 w-4" />PDF{effective === "draft" ? " (draft)" : ""}</Button>
          {quote && <Button variant="outline" className="h-11" onClick={duplicate} disabled={busy} data-testid="button-duplicate-quote"><Copy className="mr-1.5 h-4 w-4" />Duplicate</Button>}
          {locked && <Button variant="outline" className="h-11" onClick={() => setJobOpen(true)} disabled={busy} data-testid="button-convert-job"><CalendarPlus className="mr-1.5 h-4 w-4" />Create job</Button>}
          {locked && <Button variant="outline" className="h-11" onClick={makeInvoice} disabled={busy} data-testid="button-convert-invoice"><Receipt className="mr-1.5 h-4 w-4" />Create invoice</Button>}
          {calc && <span className="ml-auto text-sm font-semibold tabular-nums text-secondary" data-testid="text-total-bar">{formatCurrency(calc.total)}</span>}
        </div>
      </div>

      <Dialog open={jobOpen} onOpenChange={setJobOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule job from quote</DialogTitle></DialogHeader>
          {!w.customerPhone.trim() && <p className="text-sm text-destructive" data-testid="text-job-phone-required">A customer phone number is required. Reopen a copy of this quote to add one, or duplicate it.</p>}
          <label className="space-y-1 text-sm">Scheduled date and time
            <Input type="datetime-local" className="h-11" value={when} onChange={e => setWhen(e.target.value)} data-testid="input-job-when" /></label>
          <DialogFooter><Button className="h-11" onClick={makeJob} disabled={!w.customerPhone.trim() || toJob.isPending} data-testid="button-confirm-job">Create job</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <span className="hidden">{quote ? storedTotal(quote) : ""}</span>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotes, useDeleteQuote, useDuplicateQuote, useListContacts, useListJobs, useListCalls, useGetCompany,
  getListQuotesQueryKey, type Call, type Contact, type Job, type Quote,
} from "@workspace/api-client-react";
import { blankQuoteWorkflow, legacyQuoteWorkflow, type QuoteWorkflow } from "@workspace/api-zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QuoteEditor, type EditorInit } from "@/components/quotes/editor";
import { QuoteList } from "@/components/quotes/quote-list";
import { NewQuoteDialog, type StartKind } from "@/components/quotes/new-quote-dialog";
import { apiBase, newItem, normalizeWorkflow, storedTotal } from "@/components/quotes/helpers";
import { useVoice } from "@/lib/voice-context";

type Extracted = { suggestedTitle?: string; materials?: { name: string; quantity: number; unit: string }[]; scope?: string; missing?: unknown; warnings?: unknown; message?: unknown; notes?: unknown };

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

function callItems(ms: Extracted["materials"]) {
  return (ms ?? []).map(m => ({ ...newItem("materials"), description: m.name ?? "", quantity: Number(m.quantity) || 0, unit: m.unit || "item" }));
}

export default function Quotes() {
  const quotesQ = useListQuotes();
  const { data: contacts = [] } = useListContacts();
  const { data: jobs = [] } = useListJobs();
  const { data: calls = [] } = useListCalls();
  const { data: company } = useGetCompany();
  const del = useDeleteQuote();
  const dup = useDuplicateQuote();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [init, setInit] = useState<EditorInit | null>(null);
  const [key, setKey] = useState(0);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const launched = useRef(false);
  const { quoteDraft, setQuoteDraft } = useVoice();

  const open = (i: EditorInit) => { setInit(i); setKey(k => k + 1); };
  const base = (): QuoteWorkflow => ({ ...blankQuoteWorkflow(), paymentTerms: company?.paymentTerms ?? "" });

  const fromContact = (c: Contact): Partial<QuoteWorkflow> => ({ customerName: c.name, customerPhone: c.phone, customerEmail: c.email ?? "", billingAddress: c.address ?? "", siteAddress: c.address ?? "" });
  const fromJob = (j: Job): Partial<QuoteWorkflow> => ({ customerName: j.contactName, customerPhone: j.contactPhone, siteAddress: j.address ?? "", scope: j.description ?? "" });

  useEffect(() => {
    if (!quoteDraft?.length || !company) return;
    launched.current = true;
    const workflow = { ...blankQuoteWorkflow(), paymentTerms: company.paymentTerms ?? "" };
    workflow.sections = [{ id: "work", title: "Work & materials", items: callItems(quoteDraft) }];
    open({ quote: null, workflow, title: "", notices: [
      "Photo draft — check every description, quantity and unit against the original image. Confirm labour and prices before saving or sending.",
    ] });
    setQuoteDraft(null);
  }, [quoteDraft, setQuoteDraft, company]);

  const start = async (kind: StartKind, id?: number) => {
    const w = base();
    if (kind === "blank") { open({ quote: null, workflow: w, title: "" }); setDialog(false); return; }
    if (kind === "contact") {
      const c = contacts.find(x => x.id === id); if (!c) return;
      open({ quote: null, workflow: { ...w, ...fromContact(c) }, title: "", contactId: c.id });
    } else if (kind === "job") {
      const j = jobs.find(x => x.id === id); if (!j) return;
      const c = contacts.find(x => x.id === j.contactId);
      open({ quote: null, workflow: { ...w, ...(c ? fromContact(c) : {}), ...fromJob(j) }, title: j.title, contactId: j.contactId ?? null, jobId: j.id });
    } else {
      const c: Call | undefined = calls.find(x => x.id === id); if (!c) return;
      setBusy(true);
      let ex: Extracted = {};
      const notices: string[] = ["Call-derived quantities are evidence only. Cost and selling start at zero; price every line yourself."];
      try {
        const r = await fetch(`${apiBase()}/api/calls/${c.id}/extract-quote`, { method: "POST" });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(typeof e.error === "string" ? e.error : "Could not extract details from this call."); }
        ex = await r.json();
        notices.push(...asList(ex.missing), ...asList(ex.warnings), ...asList(ex.message), ...asList(ex.notes));
        if (!ex.materials?.length) notices.push("The call does not state materials with clear quantities. Confirm the scope with the customer and add lines manually.");
      } catch (e) { notices.push(e instanceof Error ? e.message : "Extraction failed. Add lines manually."); }
      const ct = contacts.find(x => x.id === c.contactId);
      const wf: QuoteWorkflow = { ...w, ...(ct ? fromContact(ct) : {}), customerName: ct?.name ?? c.callerName, customerPhone: ct?.phone ?? c.callerPhone, scope: ex.scope ?? "" };
      wf.sections = [{ id: "work", title: "Work & materials", items: callItems(ex.materials) }];
      open({ quote: null, workflow: wf, title: ex.suggestedTitle ?? "", contactId: c.contactId ?? null, callId: c.id, notices });
      setBusy(false);
    }
    setDialog(false);
  };

  // Launch from sessionStorage prefill or URL params, once data is ready.
  useEffect(() => {
    if (launched.current || !company) return;
    const raw = sessionStorage.getItem("buildai_prefill_quote");
    const p = new URLSearchParams(window.location.search);
    if (raw) {
      launched.current = true;
      sessionStorage.removeItem("buildai_prefill_quote");
      try {
        const pf = JSON.parse(raw) as Extracted & { title?: string; callerName?: string; callId?: number; contactId?: number };
        const w = base();
        w.customerName = pf.callerName ?? ""; w.scope = pf.scope ?? "";
        w.sections = [{ id: "work", title: "Work & materials", items: callItems(pf.materials) }];
        open({ quote: null, workflow: w, title: pf.title ?? pf.suggestedTitle ?? "", callId: pf.callId ?? null, contactId: pf.contactId ?? null,
          notices: [pf.materials?.length ? "Call draft: only explicitly stated materials and quantities were added. Price every line and review scope before use." : "Call draft: the enquiry does not specify materials with clear quantities. Confirm scope with the customer and add lines manually."] });
      } catch { /* ignore bad prefill */ }
      return;
    }
    const jobId = Number(p.get("jobId")), contactId = Number(p.get("contactId")), callId = Number(p.get("callId"));
    if (!jobId && !contactId && !callId) { launched.current = true; return; }
    if (!jobs.length && !contacts.length && !calls.length) return;
    launched.current = true;
    void start(jobId ? "job" : callId ? "call" : "contact", jobId || callId || contactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, jobs, contacts, calls]);

  const openQuote = (q: Quote) => {
    if (q.workflow) { open({ quote: q, workflow: normalizeWorkflow(q.workflow as unknown as QuoteWorkflow), title: q.title, contactId: q.contactId, callId: q.callId, jobId: q.jobId }); return; }
    if (!window.confirm("This is an older quote without line-level pricing. Editing rebuilds it approximately and may not match the stored total. Nothing changes until you save. Continue?")) return;
    open({ quote: q, workflow: legacyQuoteWorkflow({ ...q, materials: q.materials as never }, { paymentTerms: company?.paymentTerms ?? "" }), title: q.title, contactId: q.contactId, callId: q.callId, jobId: q.jobId, legacyOldTotal: storedTotal(q) });
  };
  const duplicate = (q: Quote) => dup.mutate({ id: q.id }, {
    onSuccess: n => { qc.invalidateQueries({ queryKey: getListQuotesQueryKey() }); toast({ title: "Duplicated as a new draft" }); openQuote(n); },
    onError: () => toast({ title: "Could not duplicate", variant: "destructive" }),
  });
  const remove = (q: Quote) => {
    if (!window.confirm(`Delete "${q.title}"?`)) return;
    del.mutate({ id: q.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListQuotesQueryKey() }); toast({ title: "Quote deleted" }); }, onError: () => toast({ title: "Could not delete", variant: "destructive" }) });
  };

  if (init) return <QuoteEditor key={key} init={init} company={company} onBack={() => setInit(null)} onOpen={openQuote} />;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight text-secondary">Quotes</h1><p className="text-sm text-muted-foreground">Editable quotes with private costs and customer-ready documents.</p></div>
        <Button className="h-11" onClick={() => setDialog(true)} data-testid="button-new-quote"><Plus className="mr-1.5 h-4 w-4" />New quote</Button>
      </div>
      <QuoteList quotes={quotesQ.data ?? []} loading={quotesQ.isLoading} error={quotesQ.isError} onRetry={() => quotesQ.refetch()} onOpen={openQuote} onDuplicate={duplicate} onDelete={remove} />
      <NewQuoteDialog open={dialog} onOpenChange={setDialog} contacts={contacts} jobs={jobs} calls={calls} busy={busy} onStart={start} />
    </div>
  );
}

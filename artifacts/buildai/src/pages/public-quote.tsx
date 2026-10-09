import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPublicQuote, useRespondToPublicQuote, getGetPublicQuoteQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

function useHead() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Your quote";
    const made: HTMLMetaElement[] = [];
    for (const [n, c] of [["description", "Review and respond to your quote."], ["robots", "noindex, nofollow"], ["referrer", "no-referrer"]]) {
      const m = document.createElement("meta"); m.name = n; m.content = c; document.head.appendChild(m); made.push(m);
    }
    return () => { document.title = prevTitle; made.forEach(m => m.remove()); };
  }, []);
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] bg-stone-100 px-3 py-6 text-stone-900 sm:py-12"><div className="mx-auto max-w-3xl">{children}</div></div>
);
const Note = ({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) => (
  <Shell><div className="rounded-xl border border-stone-300 bg-white p-8 text-center" data-testid="public-quote-note">
    <h1 className="text-xl font-bold">{title}</h1><p className="mt-2 text-sm text-stone-600">{body}</p>
    {onRetry && <Button className="mt-4 h-11" onClick={onRetry} data-testid="button-retry-quote">Try again</Button>}
  </div></Shell>
);

export default function PublicQuotePage() {
  useHead();
  const [, p] = useRoute("/quote/accept/:token");
  const token = p?.token ?? "";
  const qc = useQueryClient();
  const q = useGetPublicQuote(token, { query: { queryKey: getGetPublicQuoteQueryKey(token), enabled: !!token } });
  const respond = useRespondToPublicQuote();
  const [mode, setMode] = useState<"none" | "accept" | "changes">("none");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"accept" | "request_changes" | null>(null);

  if (q.isLoading) return <Shell><div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-stone-200" />)}</div></Shell>;
  if (q.isError || !q.data) {
    const status = (q.error as { status?: number } | null)?.status;
    if (status === 404 || status === 410) return <Note title="This link is no longer valid" body="It may have been replaced by a newer link. Please ask the contractor for the latest one." />;
    return <Note title="Could not load the quote" body="Check your connection and try again." onRetry={() => q.refetch()} />;
  }
  const d = q.data;
  const a = d.company.quoteAccentColor && /^#[0-9a-fA-F]{3,8}$/.test(d.company.quoteAccentColor) ? d.company.quoteAccentColor : "#1f3a4d";
  const send = (action: "accept" | "request_changes") => {
    setErr(null);
    respond.mutate({ token, data: { action, revision: d.revision, ...(action === "request_changes" ? { message: msg.trim() } : {}) } }, {
      onSuccess: response => {
        qc.setQueryData(getGetPublicQuoteQueryKey(token), response);
        setDone(action); setMode("none");
        qc.invalidateQueries({ queryKey: getGetPublicQuoteQueryKey(token) });
      },
      onError: e => {
        const s = (e as { status?: number })?.status;
        setErr(s === 409 ? "This quote was updated. Reload to see the latest version." : "Could not send your response. Please try again.");
        if (s === 409) qc.invalidateQueries({ queryKey: getGetPublicQuoteQueryKey(token) });
      },
    });
  };
  const responded = d.status === "accepted" || d.status === "changes_requested";
  const row = "flex justify-between gap-4 py-1 text-sm tabular-nums";
  return (
    <Shell>
      <article className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm" data-testid="public-quote">
        <header className="p-5 text-white sm:p-8" style={{ background: a }}>
          <div className="flex items-center gap-3">
            {d.company.logoUrl && <img src={d.company.logoUrl} alt="" className="h-12 w-12 rounded bg-white object-contain p-1" />}
            <div><p className="text-lg font-bold">{d.company.name}</p>{d.company.quoteTagline && <p className="text-sm opacity-80">{d.company.quoteTagline}</p>}</div>
          </div>
          <h1 className="mt-6 text-2xl font-bold sm:text-3xl" data-testid="text-quote-title">{d.title}</h1>
          <p className="mt-1 text-sm opacity-80">Q-{d.id} | Valid until {d.validUntil}</p>
        </header>
        <div className="space-y-6 p-5 sm:p-8">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase text-stone-500">Prepared for</p><p>{d.customerName}</p><p className="text-stone-600">{d.siteAddress}</p></div>
            <div><p className="text-xs font-semibold uppercase text-stone-500">From</p>{[d.company.address, d.company.phone, d.company.email].filter(Boolean).map(x => <p key={x} className="text-stone-600">{x}</p>)}{d.vatNumber && <p className="text-stone-600">VAT {d.vatNumber}</p>}</div>
          </div>
          {d.scope && <section><h2 className="mb-1 font-bold">Scope of work</h2><p className="whitespace-pre-wrap text-sm text-stone-700">{d.scope}</p></section>}
          {d.sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-2 border-b-2 pb-1 font-bold" style={{ borderColor: a }}>{s.title}</h2>
              <ul className="divide-y divide-stone-200">
                {s.items.map((it, j) => (
                  <li key={j} className="flex justify-between gap-4 py-2 text-sm">
                    <div className="min-w-0"><p>{it.description}</p><p className="text-xs text-stone-500">{it.quantity} {it.unit} x {formatCurrency(it.unitPrice)}</p></div>
                    <p className="font-semibold tabular-nums">{formatCurrency(it.total)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="ml-auto max-w-xs border-t-2 pt-2" style={{ borderColor: a }}>
            <p className={row}><span>Subtotal</span><span>{formatCurrency(d.subtotal)}</span></p>
            <p className={row}><span>VAT {d.vatPercent}%</span><span>{formatCurrency(d.vatAmount)}</span></p>
            <p className={`${row} text-lg font-bold`}><span>Total</span><span data-testid="text-public-total">{formatCurrency(d.total)}</span></p>
            {d.depositAmount > 0 && <><p className={row}><span>Deposit requested</span><span>{formatCurrency(d.depositAmount)}</span></p><p className={row}><span>Balance after deposit</span><span>{formatCurrency(d.balance)}</span></p><p className="mt-2 text-xs text-stone-600">The deposit is part of the total, not an extra charge. Payment has not been recorded.</p></>}
          </section>
          {([["Assumptions", d.assumptions], ["Exclusions", d.exclusions], ["Payment terms", d.paymentTerms]] as const).filter(x => x[1]).map(([t, b]) => (
            <section key={t}><h2 className="mb-1 font-bold">{t}</h2><p className="whitespace-pre-wrap text-sm text-stone-700">{b}</p></section>
          ))}
          {d.company.quoteFooterText && <p className="text-xs text-stone-500">{d.company.quoteFooterText}</p>}

          <section className="rounded-lg border border-stone-300 bg-stone-50 p-4" data-testid="response-panel">
            {done === "accept" || d.status === "accepted" ? (
              <p className="font-semibold" data-testid="text-accepted">{done ? "Thank you. Your acceptance has been recorded for the contractor." : "This quote has been accepted."}</p>
            ) : d.status === "changes_requested" ? (
              <div data-testid="text-changes-requested"><p className="font-semibold">{done ? "Your change request was sent." : "Changes have been requested."}</p>{d.changeRequest && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{d.changeRequest}</p>}<p className="mt-1 text-sm text-stone-600">The contractor will send an updated quote.</p></div>
            ) : d.expired ? (
              <p className="font-semibold" data-testid="text-expired">This quote has expired. Please contact {d.company.name} for an updated quote.</p>
            ) : mode === "accept" ? (
              <div className="space-y-3">
                <p className="text-sm">By accepting you agree to this quote for <strong>{formatCurrency(d.total)}</strong> inc VAT on the terms above.</p>
                <div className="flex flex-wrap gap-2"><Button className="h-12 text-white hover:text-white" style={{ background: a }} disabled={respond.isPending} onClick={() => send("accept")} data-testid="button-confirm-accept">{respond.isPending ? "Sending..." : "Yes, accept quote"}</Button><Button variant="outline" className="h-12 bg-white text-stone-900 hover:bg-stone-100 hover:text-stone-900" disabled={respond.isPending} onClick={() => setMode("none")}>Back</Button></div>
              </div>
            ) : mode === "changes" ? (
              <div className="space-y-3">
                <label className="block text-sm font-semibold">What would you like changed?
                  <Textarea className="mt-1 min-h-28" maxLength={5000} value={msg} onChange={e => setMsg(e.target.value)} data-testid="input-change-message" /></label>
                <div className="flex flex-wrap gap-2"><Button className="h-12 text-white hover:text-white" style={{ background: a }} disabled={respond.isPending || !msg.trim()} onClick={() => send("request_changes")} data-testid="button-send-changes">{respond.isPending ? "Sending..." : "Send request"}</Button><Button variant="outline" className="h-12 bg-white text-stone-900 hover:bg-stone-100 hover:text-stone-900" disabled={respond.isPending} onClick={() => setMode("none")}>Back</Button></div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="h-12 flex-1 text-base text-white hover:text-white" style={{ background: a }} onClick={() => { setErr(null); setMode("accept"); }} data-testid="button-accept">Accept quote</Button>
                <Button variant="outline" className="h-12 flex-1 bg-white text-base text-stone-900 hover:bg-stone-100 hover:text-stone-900" onClick={() => { setErr(null); setMode("changes"); }} data-testid="button-request-changes">Request changes</Button>
              </div>
            )}
            {err && <p className="mt-3 text-sm text-red-700" role="alert" data-testid="text-response-error">{err}</p>}
          </section>
        </div>
      </article>
    </Shell>
  );
}

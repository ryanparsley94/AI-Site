import type { Company } from "@workspace/api-client-react";
import type { QuoteWorkflow } from "@workspace/api-zod";
import { formatCurrency } from "@/lib/utils";
import type { Calc } from "./helpers";

export function CustomerPreview({ w, calc, company, title, refText, draft }: {
  w: QuoteWorkflow; calc: Calc; company?: Company | null; title: string; refText: string; draft: boolean;
}) {
  const byId = new Map(calc.lines.map(l => [l.id, l]));
  const block = (h: string, t: string) => t.trim() ? <div className="mt-5"><h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{h}</h4><p className="mt-1 whitespace-pre-wrap text-sm">{t}</p></div> : null;
  return (
    <div className="mx-auto max-w-3xl rounded-md bg-[#F7FAF9] p-5 text-[#0D171C] shadow-lg sm:p-8" data-testid="customer-preview">
      {draft && <p className="mb-3 inline-block rounded bg-[#0D171C] px-2 py-0.5 text-xs font-bold tracking-widest text-[#36C6D5]">DRAFT</p>}
      <div className="flex items-start justify-between gap-4 border-b-2 border-[#36C6D5] pb-4">
        <div>
          <h2 className="text-xl font-bold">{company?.name ?? "Your company"}</h2>
          <p className="text-xs text-slate-600">{[company?.address, company?.phone, company?.email].filter(Boolean).join("  |  ")}</p>
        </div>
        {company?.logoUrl && <img src={company.logoUrl} alt="" className="h-12 max-w-[120px] object-contain" />}
      </div>
      <div className="mt-4 flex justify-between gap-4 text-sm">
        <div><p className="text-lg font-bold">Quote</p><p>{title}</p></div>
        <div className="text-right"><p>Ref {refText}</p>{w.validUntil && <p>Valid until {new Date(w.validUntil).toLocaleDateString("en-GB")}</p>}</div>
      </div>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs font-bold uppercase text-slate-500">Prepared for</p><p>{w.customerName}</p><p className="whitespace-pre-wrap">{w.billingAddress}</p></div>
        <div><p className="text-xs font-bold uppercase text-slate-500">Site</p><p className="whitespace-pre-wrap">{w.siteAddress}</p></div>
      </div>
      {block("Scope of work", w.scope)}
      {w.sections.map(s => s.items.length > 0 && (
        <div key={s.id} className="mt-5">
          <h4 className="border-b border-slate-300 pb-1 text-sm font-bold">{s.title}</h4>
          {s.items.map(i => (
            <div key={i.id} className="flex justify-between gap-3 border-b border-slate-200 py-1.5 text-sm">
              <div><p>{i.description}</p><p className="text-xs text-slate-500">{i.quantity} {i.unit} at {formatCurrency(i.sellPrice)}</p></div>
              <p className="tabular-nums">{formatCurrency(byId.get(i.id)?.total ?? 0)}</p>
            </div>
          ))}
        </div>
      ))}
      <div className="ml-auto mt-5 w-full max-w-xs space-y-1 text-sm tabular-nums">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(calc.subtotal)}</span></div>
        <div className="flex justify-between"><span>{w.vatRegistered ? `VAT ${calc.vatPercent}%` : "VAT not charged"}</span><span>{formatCurrency(calc.vatAmount)}</span></div>
        <div className="flex justify-between border-t border-slate-400 pt-1 text-base font-bold"><span>Total</span><span>{formatCurrency(calc.total)}</span></div>
        {w.deposit.mode !== "none" && <><div className="flex justify-between"><span>Deposit</span><span>{formatCurrency(calc.depositAmount)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance</span><span>{formatCurrency(calc.balance)}</span></div></>}
      </div>
      {block("Assumptions", w.assumptions)}
      {block("Exclusions", w.exclusions)}
      {block("Payment terms", w.paymentTerms)}
      {w.vatRegistered && w.vatNumber && <p className="mt-4 text-xs text-slate-500">VAT number {w.vatNumber}</p>}
    </div>
  );
}

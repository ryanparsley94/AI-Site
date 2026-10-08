import { useEffect, useRef, useState } from "react";
import type { Company } from "@workspace/api-client-react";
import type { QuoteWorkflow } from "@workspace/api-zod";
import { AlertTriangle, ImageOff } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { pdfBranding } from "@/lib/pdf-branding";
import type { Calc } from "./helpers";

export type PreviewTemplate = "classic" | "modern" | "minimal";
const TEMPLATES: PreviewTemplate[] = ["classic", "modern", "minimal"];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function TemplateControls({ saved, value, onChange, locked }: {
  saved?: string; value: PreviewTemplate | null; onChange: (t: PreviewTemplate | null) => void; locked: boolean;
}) {
  const savedT = (saved || "classic") as PreviewTemplate;
  const active = locked ? savedT : value ?? savedT;
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card/60 p-3 text-sm" data-testid="preview-template-controls">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compare layout</span>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Preview template">
          {TEMPLATES.map(t => (
            <button key={t} type="button" disabled={locked} aria-pressed={active === t} onClick={() => onChange(t === savedT ? null : t)}
              data-testid={`button-preview-template-${t}`}
              className={`h-9 rounded px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${active === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {cap(t)}
            </button>
          ))}
        </div>
        {!locked && value && value !== savedT && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-primary underline-offset-2 hover:underline" data-testid="button-preview-reset">Reset</button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="text-preview-template-note">
        {locked
          ? `Accepted quote: layout is fixed to the ${cap(savedT)} template saved with it.`
          : value && value !== savedT
            ? `Comparing ${cap(value)}. The PDF will still use your saved ${cap(savedT)} template. Nothing is saved by this switch.`
            : `Showing your saved ${cap(savedT)} template, the same one the PDF uses. Switching is for comparison only.`}
      </p>
    </div>
  );
}

export function CustomerPreview({ w, calc, error, company, title, refText, draft, createdAt, template }: {
  w: QuoteWorkflow; calc: Calc | null; error?: string | null; company?: Company | null; title: string; refText: string; draft: boolean;
  createdAt?: string; template?: PreviewTemplate | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / 720)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [!!calc]);
  const logoUrl = company?.logoUrl;
  useEffect(() => { setLogoFailed(false); }, [logoUrl]);

  const eff = template ? ({ ...(company ?? {}), quoteTemplate: template } as Company) : company;
  const b = pdfBranding(eff);
  const tpl = b.template;
  const accent = `rgb(${b.accent.join(",")})`;
  const date = new Date(createdAt ?? Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const contact = [company?.address, company?.phone, company?.email].filter(Boolean).join("  |  ");
  const dark = tpl === "classic";

  if (!calc) {
    return (
      <div className="mx-auto max-w-3xl rounded-md border border-destructive/50 bg-destructive/10 p-5 text-sm" role="alert" data-testid="customer-preview-error">
        <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />Preview unavailable</p>
        <p className="mt-1 text-muted-foreground">{error || "Quote values are invalid."} Totals are hidden until this is fixed, so you never see out-of-date amounts.</p>
      </div>
    );
  }
  const byId = new Map(calc.lines.map(l => [l.id, l]));
  const block = (h: string, t?: string | null) => t && t.trim() ? <div className="mt-5"><h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: `rgb(${b.accent.map(c => Math.round(c * 0.6)).join(",")})` }}>{h}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm">{t}</p></div> : null;
  const custLines = [w.customerName, w.customerEmail, w.customerPhone, w.billingAddress].filter(s => s.trim()).join("\n");

  return (
    <div ref={container} className="mx-auto w-full max-w-[720px]" data-testid="preview-paper-container">
    <div style={{ width: 720, zoom: scale }} className="relative overflow-hidden rounded-md bg-white text-[#0D171C] shadow-lg" data-testid="customer-preview" data-template={tpl}>
      {tpl === "modern" && <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} data-testid="preview-accent-stripe" />}
      {draft && <span className="pointer-events-none absolute right-4 top-1/2 -rotate-[20deg] select-none text-6xl font-black tracking-widest text-[#0D171C]/10 sm:text-8xl">DRAFT</span>}
      <div className={dark ? "bg-[#0D171C] px-5 py-5 text-white sm:px-8" : "px-5 pt-5 sm:px-8 sm:pt-8"} data-testid="preview-header">
        {draft && <p style={{ background: accent }} className="mb-3 inline-block rounded px-2 py-0.5 text-xs font-bold tracking-widest text-[#0D171C]">DRAFT</p>}
        <div className={`flex items-start justify-between gap-4 ${tpl === "modern" ? "pl-2" : ""}`}>
          <div className="min-w-0">
            <h2 className={tpl === "minimal" ? "text-base font-bold uppercase tracking-wide" : "text-xl font-bold"}>{company?.name || "Your company"}</h2>
            {contact && <p className={`mt-1 text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>{contact}</p>}
            {company?.quoteTagline && <p className={`mt-1 text-xs italic ${dark ? "text-slate-300" : "text-slate-500"}`}>{company.quoteTagline}</p>}
          </div>
          {logoUrl && !logoFailed && <img src={logoUrl} alt="Company logo" onError={() => setLogoFailed(true)} className="h-12 max-w-[120px] object-contain" data-testid="img-preview-logo" />}
          {logoUrl && logoFailed && <p className="flex max-w-[140px] items-center gap-1 rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-xs text-amber-900" role="alert" data-testid="text-logo-error"><ImageOff className="h-3.5 w-3.5 shrink-0" />Logo could not load. Check it in Settings.</p>}
        </div>
      </div>
      {tpl === "classic" && <div className="h-1" style={{ background: accent }} data-testid="preview-accent-divider" />}
      {tpl === "modern" && <div className="mx-5 mt-3 h-0.5 sm:mx-8" style={{ background: accent }} />}
      {tpl === "minimal" && <div className="mx-5 mt-3 h-0.5 bg-[#0D171C] sm:mx-8" />}

      <div className={`p-5 sm:p-8 ${tpl === "modern" ? "sm:pl-10" : ""}`}>
        <div className="flex justify-between gap-4 text-sm">
          <div className="min-w-0"><p className="text-lg font-bold">QUOTE</p><p className="break-words">{title}</p></div>
          <div className="shrink-0 text-right text-slate-600"><p>Ref {refText}</p><p>Date {date}</p>{w.validUntil && <p>Valid until {new Date(w.validUntil).toLocaleDateString("en-GB")}</p>}</div>
        </div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {custLines && <div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Prepared for</h4><p className="whitespace-pre-wrap">{custLines}</p></div>}
          {w.siteAddress.trim() && <div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Site address</h4><p className="whitespace-pre-wrap">{w.siteAddress}</p></div>}
        </div>
        {block("Scope of work", w.scope)}
        {w.sections.map(s => s.items.length > 0 && (
          <div key={s.id} className="mt-5 overflow-x-auto">
            <table className={`w-full min-w-[420px] border-collapse text-sm ${tpl === "minimal" ? "border border-black" : ""}`}>
              <thead>
                <tr className={tpl === "minimal" ? "bg-white text-black" : "text-white"} style={tpl === "classic" ? { background: "#0D171C" } : tpl === "modern" ? { background: accent } : undefined}>
                  <th className={`px-2 py-1.5 text-left font-semibold ${tpl === "minimal" ? "border border-black" : ""}`}>{s.title || "Items"}</th>
                  <th className={`px-2 py-1.5 text-left font-semibold ${tpl === "minimal" ? "border border-black" : ""}`}>Qty</th>
                  <th className={`px-2 py-1.5 text-right font-semibold ${tpl === "minimal" ? "border border-black" : ""}`}>Unit price</th>
                  <th className={`px-2 py-1.5 text-right font-semibold ${tpl === "minimal" ? "border border-black" : ""}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((i, n) => {
                  const cell = tpl === "minimal" ? "border border-slate-400" : "";
                  return (
                    <tr key={i.id} className={tpl !== "minimal" && n % 2 === 1 ? "bg-slate-200/60" : ""}>
                      <td className={`px-2 py-1.5 ${cell}`}>{i.description}</td>
                      <td className={`whitespace-nowrap px-2 py-1.5 ${cell}`}>{i.quantity} {i.unit}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${cell}`}>{formatCurrency(i.sellPrice)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${cell}`}>{formatCurrency(byId.get(i.id)?.total ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <div className="ml-auto mt-5 w-full max-w-xs space-y-1 text-sm tabular-nums" data-testid="preview-totals">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(calc.subtotal)}</span></div>
          <div className="flex justify-between"><span>{w.vatRegistered ? `VAT (${calc.vatPercent}%)` : "VAT not charged"}</span><span>{formatCurrency(calc.vatAmount)}</span></div>
          <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: accent }}><span>Total</span><span>{formatCurrency(calc.total)}</span></div>
          {w.deposit.mode !== "none" && <>
            <div className="flex justify-between"><span>Deposit due</span><span>{formatCurrency(calc.depositAmount)}</span></div>
            <div className="flex justify-between font-bold"><span>Balance</span><span>{formatCurrency(calc.balance)}</span></div></>}
          {w.vatRegistered && w.vatNumber && <p className="pt-1 text-right text-xs text-slate-500">VAT number {w.vatNumber}</p>}
        </div>
        {block("Assumptions", w.assumptions)}
        {block("Exclusions", w.exclusions)}
        {block("Payment terms", w.paymentTerms)}
        {block("Notes", company?.quoteFooterText)}
        <p className="mt-6 border-t border-slate-300 pt-2 text-[11px] text-slate-500" data-testid="preview-footer">{[company?.name || "Your company", ...(contact ? [contact] : [])].join("  |  ")}</p>
      </div>
    </div>
    </div>
  );
}

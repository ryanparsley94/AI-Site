import { blankQuoteWorkflow, calculateQuote, type QuoteItem, type QuoteItemType, type QuoteWorkflow } from "@workspace/api-zod";
import type { Quote } from "@workspace/api-client-react";

export type Calc = ReturnType<typeof calculateQuote>;
export const UNITS = ["item", "hrs", "day", "m", "m2", "m3", "kg", "l", "each", "set", "pack", "sheet", "roll", "lot"];
export const ITEM_TYPES: { value: QuoteItemType; label: string }[] = [
  { value: "materials", label: "Materials" },
  { value: "labour", label: "Labour" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "plant", label: "Plant / hire" },
  { value: "other", label: "Other" },
];
export const uid = () => Math.random().toString(36).slice(2, 10);

export function newItem(type: QuoteItemType = "materials"): QuoteItem {
  return { id: uid(), type, description: "", quantity: 1, unit: type === "labour" ? "hrs" : "item", costPrice: 0, sellPrice: 0 };
}

export function safeCalc(w: QuoteWorkflow): { calc: Calc | null; error: string | null } {
  try {
    return { calc: calculateQuote(w), error: null };
  } catch (e) {
    return { calc: null, error: e instanceof Error ? e.message : "Quote values are invalid." };
  }
}

export function normalizeWorkflow(w: Partial<QuoteWorkflow> | null | undefined): QuoteWorkflow {
  const b = blankQuoteWorkflow();
  const x = { ...b, ...(w ?? {}) } as QuoteWorkflow;
  x.deposit = { ...b.deposit, ...(w?.deposit ?? {}) };
  x.sections = (w?.sections?.length ? w.sections : b.sections).map(s => ({ ...s, items: [...(s.items ?? [])] }));
  return x;
}

export function reviewIssues(w: QuoteWorkflow, calc: Calc | null, calcError: string | null): string[] {
  const out: string[] = [];
  if (calcError) out.push(calcError);
  if (!w.customerName.trim()) out.push("Customer name");
  if (!w.siteAddress.trim()) out.push("Site address");
  if (!w.scope.trim()) out.push("Scope of work");
  if (!w.validUntil) out.push("Quote expiry date");
  if (!w.paymentTerms.trim()) out.push("Payment terms");
  const ok = w.sections.some(s => s.items.some(i => i.description.trim() && i.quantity > 0 && i.sellPrice > 0));
  if (!ok) out.push("At least one described line with quantity and selling price");
  void calc;
  return out;
}

export function storedTotal(q: Quote): number {
  return q.totalIncVat ?? q.grandTotal;
}

export function quoteTotal(q: Quote): number {
  if (q.workflow) {
    const { calc } = safeCalc(normalizeWorkflow(q.workflow as unknown as QuoteWorkflow));
    if (calc) return calc.total;
  }
  return storedTotal(q);
}

export const statusLabel = (s?: string) => (s === "accepted" ? "Accepted" : s === "reviewed" ? "Reviewed" : "Draft");
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

import { createHash, randomBytes } from "node:crypto";
import type { quotesTable } from "@workspace/db";
import { calculateQuote, money, type QuoteWorkflow, GetPublicQuoteResponse } from "@workspace/api-zod";
import { QuoteError, validateWorkflow } from "./quote-workflow";

type QuoteRow = typeof quotesTable.$inferSelect;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newAcceptanceToken = () => randomBytes(32).toString("hex");
export const quoteExpired = (w: QuoteWorkflow) => !w.validUntil || w.validUntil < new Date().toISOString().slice(0, 10);

export function assertShareable(q: QuoteRow) {
  if (q.status !== "reviewed" || !q.workflow) throw new QuoteError("Save and review this quote before sharing it.", 409);
  validateWorkflow(q.workflow as QuoteWorkflow, true);
}

/** Deliberate allowlist: never serialize the internal workflow or calculator result. */
export function publicQuote(q: QuoteRow) {
  const w = q.workflow as QuoteWorkflow;
  const totals = calculateQuote(w);
  if (Number(q.totalIncVat) !== totals.total) throw new QuoteError("Quote totals are inconsistent. Contact the contractor.", 409);
  const c = (q.companySnapshot ?? {}) as Record<string, unknown>;
  return GetPublicQuoteResponse.parse({
    id: q.id, title: q.title, revision: q.revision, status: q.status,
    customerName: w.customerName, siteAddress: w.siteAddress, scope: w.scope,
    assumptions: w.assumptions, exclusions: w.exclusions, paymentTerms: w.paymentTerms,
    validUntil: w.validUntil, vatNumber: w.vatRegistered ? w.vatNumber : "",
    expired: quoteExpired(w), changeRequest: q.changeRequest,
    subtotal: totals.subtotal, vatPercent: totals.vatPercent, vatAmount: totals.vatAmount,
    total: totals.total, depositAmount: totals.depositAmount, balance: totals.balance,
    company: {
      name: c.name ?? "CREWON",
      address: c.address ?? null, phone: c.phone ?? null, email: c.email ?? null,
      logoUrl: c.logoUrl ?? null, quoteAccentColor: c.quoteAccentColor ?? null,
      quoteTagline: c.quoteTagline ?? null, quoteFooterText: c.quoteFooterText ?? null,
    },
    sections: w.sections.map(s => ({
      title: s.title, items: s.items.map(i => ({
        description: i.description, quantity: Math.round(i.quantity * 10000) / 10000,
        unit: i.unit, unitPrice: money(i.sellPrice),
        total: totals.lines.find(l => l.id === i.id)!.total,
      })),
    })),
  });
}

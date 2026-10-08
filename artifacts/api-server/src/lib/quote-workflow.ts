import { db, quotesTable, invoicesTable, jobsTable, contactsTable, callsTable, companiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { calculateQuote, money, type QuoteWorkflow } from "@workspace/api-zod";

export class QuoteError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export function quoteId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new QuoteError("Invalid quote ID.", 400);
  return id;
}
export function validateWorkflow(workflow: QuoteWorkflow, reviewed = false) {
  try { calculateQuote(workflow); } catch (error) { throw new QuoteError((error as Error).message); }
  if (workflow.validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(workflow.validUntil) ||
      !Number.isFinite(new Date(workflow.validUntil).getTime()) ||
      new Date(workflow.validUntil).toISOString().slice(0, 10) !== workflow.validUntil)) {
    throw new QuoteError("Choose a valid quote expiry date.");
  }
  const sectionIds = new Set<string>(), itemIds = new Set<string>();
  for (const section of workflow.sections) {
    if (sectionIds.has(section.id)) throw new QuoteError("Quote section IDs must be unique.");
    sectionIds.add(section.id);
    for (const item of section.items) {
      if (itemIds.has(item.id)) throw new QuoteError("Quote item IDs must be unique.");
      itemIds.add(item.id);
    }
  }
  if (reviewed) {
    if (!workflow.customerName.trim() || !workflow.siteAddress.trim() || !workflow.scope.trim() ||
        !workflow.paymentTerms.trim() || !workflow.validUntil) {
      throw new QuoteError("Before review, add the customer, site address, scope, payment terms and quote validity.");
    }
    if (workflow.validUntil < new Date().toISOString().slice(0, 10)) throw new QuoteError("Quote validity has expired.");
    const items = workflow.sections.flatMap(section => section.items);
    if (!items.length || items.some(item => !item.description.trim() || !item.unit.trim() || item.quantity <= 0) ||
        calculateQuote(workflow).total <= 0) {
      throw new QuoteError("Before review, describe every line, use positive quantities and add selling prices.");
    }
  }
}
export function financialFields(workflow: QuoteWorkflow) {
  validateWorkflow(workflow);
  const totals = calculateQuote(workflow);
  return {
    grandTotal: totals.subtotal.toFixed(2), marginPercent: null, marginAmount: null,
    vatPercent: totals.vatPercent.toFixed(2), vatAmount: totals.vatAmount.toFixed(2),
    totalIncVat: totals.total.toFixed(2),
    materials: totals.lines.map(item => ({
      name: item.description, type: item.type, quantity: Math.round(item.quantity * 10000) / 10000,
      unit: item.unit, unitPrice: money(item.sellPrice), total: item.total,
    })),
  };
}
export async function validateLinks(links: { jobId?: number | null; contactId?: number | null; callId?: number | null }) {
  for (const [id, table, label] of [
    [links.jobId, jobsTable, "job"], [links.contactId, contactsTable, "customer"], [links.callId, callsTable, "call"],
  ] as const) {
    if (id == null) continue;
    if (!Number.isSafeInteger(id) || id < 1) throw new QuoteError(`Invalid ${label} link.`);
    const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
    if (!rows.length) throw new QuoteError(`The selected ${label} no longer exists.`);
  }
}
export async function companySnapshot() {
  const [company] = await db.select().from(companiesTable).limit(1);
  if (!company) return null;
  return {
    id: company.id, name: company.name, phone: company.phone, email: company.email,
    website: company.website, address: company.address, logoUrl: company.logoUrl,
    quoteTemplate: company.quoteTemplate, quoteAccentColor: company.quoteAccentColor,
    quoteTagline: company.quoteTagline, paymentTerms: company.paymentTerms,
    quoteFooterText: company.quoteFooterText, createdAt: company.createdAt.toISOString(),
  };
}
/** A row lock makes concurrent conversion retries return the same invoice. */
export async function acceptedQuoteToInvoice(id: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM quotes WHERE id = ${id} FOR UPDATE`);
    const [quote] = await tx.select().from(quotesTable).where(eq(quotesTable.id, id));
    if (!quote) throw new QuoteError("Quote not found.", 404);
    if (quote.status !== "accepted" || !quote.workflow) throw new QuoteError("Review and accept this quote before creating an invoice.");
    const workflow = quote.workflow as QuoteWorkflow;
    const [existing] = await tx.select().from(invoicesTable).where(eq(invoicesTable.quoteId, id));
    if (existing) return existing;
    const totals = calculateQuote(workflow);
    if (Number(quote.totalIncVat) !== totals.total) throw new QuoteError("Accepted quote totals are inconsistent; conversion was stopped.", 409);
    const issue = new Date();
    const due = new Date(issue.getTime() + 30 * 86400000);
    const [invoice] = await tx.insert(invoicesTable).values({
      invoiceNumber: `PENDING-${id}`, quoteId: id, jobId: quote.jobId,
      clientName: workflow.customerName, issueDate: issue.toISOString().slice(0, 10), dueDate: due.toISOString().slice(0, 10),
      lineItems: totals.lines.map(item => ({
        name: item.description, quantity: Math.round(item.quantity * 10000) / 10000,
        unit: item.unit, unitPrice: money(item.sellPrice), total: item.total,
      })),
      subtotal: totals.subtotal.toFixed(2), vatPercent: totals.vatPercent.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2), total: totals.total.toFixed(2),
      notes: [
        `From accepted quote Q-${String(id).padStart(4, "0")}.`,
        workflow.paymentTerms,
        totals.depositAmount ? `Deposit requested: £${totals.depositAmount.toFixed(2)}. Remaining balance after that deposit is paid: £${totals.balance.toFixed(2)}. Deposit is part of the total, not an extra charge; payment has not been recorded.` : "",
      ].filter(Boolean).join("\n"),
    }).returning();
    const [numbered] = await tx.update(invoicesTable).set({
      invoiceNumber: `INV-${String(invoice.id).padStart(4, "0")}`,
    }).where(eq(invoicesTable.id, invoice.id)).returning();
    return numbered;
  });
}

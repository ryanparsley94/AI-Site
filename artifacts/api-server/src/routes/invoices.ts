import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, invoicesTable, quotesTable, jobsTable, contactsTable } from "@workspace/db";
import { acceptedQuoteToInvoice, QuoteError } from "../lib/quote-workflow";
import { adminOnly } from "../lib/adminAuth";
import { sendEmailReply } from "./email-threads-inbound";
import {
  ListInvoicesResponse,
  CreateInvoiceBody,
  CreateInvoiceResponse,
  GetInvoiceParams,
  GetInvoiceResponse,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
  UpdateInvoiceResponse,
  DeleteInvoiceParams,
} from "@workspace/api-zod";

const router = Router();
const sendingInvoices = new Set<number>();

router.post("/invoices/:id/send", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid invoice number." }); return; }
  if (sendingInvoices.has(id)) { res.status(409).json({ error: "This invoice is already being sent. Please check its status." }); return; }
  sendingInvoices.add(id);
  try {
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!invoice) { res.status(404).json({ error: "Invoice not found." }); return; }
    if (invoice.status !== "draft") { res.status(409).json({ error: "This invoice is already sent or paid. Nothing was sent again." }); return; }
    const [job] = invoice.jobId ? await db.select().from(jobsTable).where(eq(jobsTable.id, invoice.jobId)) : [];
    let contacts = job?.contactId
      ? await db.select().from(contactsTable).where(eq(contactsTable.id, job.contactId))
      : await db.select().from(contactsTable);
    if (!job?.contactId) {
      const name = (invoice.clientName || job?.contactName || "").trim().toLowerCase();
      contacts = contacts.filter(c => c.name.trim().toLowerCase() === name);
    }
    if (contacts.length !== 1 || !contacts[0].email) {
      res.status(400).json({ error: "I couldn't find one client email address. Add or link the client's contact email before sending." }); return;
    }
    const contact = contacts[0];
    const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
    const lines = Array.isArray(invoice.lineItems) ? invoice.lineItems as Array<{ name: string; quantity: number; unit: string; unitPrice: number }> : [];
    const body = [
      `Hello ${contact.name},`, "", `Please find invoice ${invoice.invoiceNumber}${job ? ` for ${job.title}` : ""}.`,
      `Issue date: ${invoice.issueDate}`, `Payment due: ${invoice.dueDate}`, "",
      ...lines.map(l => `${l.name}: ${l.quantity} ${l.unit} at ${money(Number(l.unitPrice))} — ${money(Number(l.quantity) * Number(l.unitPrice))}`),
      "", `Subtotal: ${money(Number(invoice.subtotal))}`, `VAT (${invoice.vatPercent}%): ${money(Number(invoice.vatAmount))}`,
      `Total due: ${money(Number(invoice.total))}`, "", invoice.notes || "", "Thank you for your business.",
    ].join("\n");
    if (!await sendEmailReply(contact.email!, contact.name, `Invoice ${invoice.invoiceNumber}`, body)) {
      res.status(503).json({ error: "Email delivery isn't available or the provider rejected it. The invoice is still a draft; please check your email setup." }); return;
    }
    const [updated] = await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id)).returning();
    res.json(mapInvoice(updated));
  } catch {
    res.status(500).json({ error: "The send result couldn't be confirmed. Check the invoice and client email before attempting to send again." });
  } finally { sendingInvoices.delete(id); }
});

function mapInvoice(inv: typeof invoicesTable.$inferSelect) {
  return {
    ...inv,
    subtotal: Number(inv.subtotal),
    vatPercent: Number(inv.vatPercent),
    vatAmount: Number(inv.vatAmount),
    total: Number(inv.total),
    lineItems: Array.isArray(inv.lineItems) ? inv.lineItems : [],
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  let query = db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt)).$dynamic();
  if (req.query.jobId) {
    query = query.where(eq(invoicesTable.jobId, Number(req.query.jobId)));
  }
  const rows = await query;
  res.json(ListInvoicesResponse.parse(rows.map(mapInvoice)));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { subtotal, vatPercent, vatAmount, total, lineItems, ...rest } = parsed.data;
  if (rest.quoteId) {
    const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, rest.quoteId));
    if (quote?.workflow) {
      try {
        const invoice = await acceptedQuoteToInvoice(quote.id);
        res.status(201).json(CreateInvoiceResponse.parse(mapInvoice(invoice)));
      } catch (error) {
        if (error instanceof QuoteError) res.status(error.status).json({ error: error.message });
        else throw error;
      }
      return;
    }
  }

  // Step 1: insert with a temporary placeholder invoice number
  const [draft] = await db
    .insert(invoicesTable)
    .values({
      ...rest,
      invoiceNumber: "PENDING",
      lineItems: lineItems ?? [],
      subtotal: String(subtotal ?? 0),
      vatPercent: String(vatPercent ?? 20),
      vatAmount: String(vatAmount ?? 0),
      total: String(total ?? 0),
    })
    .returning();

  // Step 2: update with the final invoice number derived from the PK (race-free)
  const invoiceNumber = `INV-${String(draft.id).padStart(4, "0")}`;
  const [row] = await db
    .update(invoicesTable)
    .set({ invoiceNumber })
    .where(eq(invoicesTable.id, draft.id))
    .returning();

  res.status(201).json(CreateInvoiceResponse.parse(mapInvoice(row)));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetInvoiceResponse.parse(mapInvoice(row)));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existingInvoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (existingInvoice?.quoteId) {
    const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, existingInvoice.quoteId));
    if (quote?.workflow && quote.status === "accepted" &&
        ["lineItems", "subtotal", "vatPercent", "vatAmount", "total", "quoteId"].some(key => key in parsed.data)) {
      res.status(409).json({ error: "This invoice retains its accepted quote prices. Create a revised quote for variations." });
      return;
    }
  }
  const { subtotal, vatPercent, vatAmount, total, lineItems, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (lineItems !== undefined) updateData.lineItems = lineItems;
  if (subtotal !== undefined) updateData.subtotal = String(subtotal);
  if (vatPercent !== undefined) updateData.vatPercent = String(vatPercent);
  if (vatAmount !== undefined) updateData.vatAmount = String(vatAmount);
  if (total !== undefined) updateData.total = String(total);
  const [row] = await db
    .update(invoicesTable)
    .set(updateData)
    .where(eq(invoicesTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateInvoiceResponse.parse(mapInvoice(row)));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.status(204).end();
});

export default router;

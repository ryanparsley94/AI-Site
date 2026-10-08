import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, invoicesTable, quotesTable } from "@workspace/db";
import { acceptedQuoteToInvoice, QuoteError } from "../lib/quote-workflow";
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

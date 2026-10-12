import { Router, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, quotesTable, quoteVersionsTable, jobsTable, invoicesTable, companiesTable } from "@workspace/db";
import {
  QuoteError, quoteId, financialFields, validateWorkflow, validateLinks, companySnapshot, acceptedQuoteToInvoice,
} from "../lib/quote-workflow";
import { openai } from "@workspace/integrations-openai-ai-server";
import { calculateQuote } from "@workspace/api-zod";
import {
  ListQuotesResponse,
  CreateQuoteBody,
  CreateQuoteResponse,
  GetQuoteParams,
  GetQuoteResponse,
  UpdateQuoteParams,
  UpdateQuoteBody,
  UpdateQuoteResponse,
  DeleteQuoteParams,
  SearchMaterialPricesBody,
  SearchMaterialPricesResponse,
  GetInvoiceResponse,
  GetJobResponse,
  ConvertQuoteToJobBody,
  type QuoteWorkflow,
} from "@workspace/api-zod";

const router = Router();
const guarded = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  try { await handler(req, res); }
  catch (error) {
    if (error instanceof QuoteError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
};

function mapQuote(q: typeof quotesTable.$inferSelect) {
  const { acceptanceTokenHash: _privateToken, ...safe } = q;
  return {
    ...safe,
    // Earlier commercial snapshots predate the required timezone field.
    companySnapshot: q.companySnapshot ? { timezone: "Europe/London", ...q.companySnapshot as object } : null,
    grandTotal: Number(q.grandTotal),
    marginPercent: q.marginPercent !== null ? Number(q.marginPercent) : null,
    vatPercent: q.vatPercent !== null ? Number(q.vatPercent) : null,
    marginAmount: q.marginAmount !== null ? Number(q.marginAmount) : null,
    vatAmount: q.vatAmount !== null ? Number(q.vatAmount) : null,
    totalIncVat: q.totalIncVat !== null ? Number(q.totalIncVat) : null,
    materials: Array.isArray(q.materials) ? q.materials : [],
    createdAt: q.createdAt.toISOString(),
    reviewedAt: q.reviewedAt?.toISOString() ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    sharedAt: q.sharedAt?.toISOString() ?? null,
    respondedAt: q.respondedAt?.toISOString() ?? null,
  };
}

// Auto-sync job.estimatedValue when a quote with totalIncVat is linked to a job
async function syncJobEstimatedValue(jobId: number, totalIncVat: number | null) {
  if (totalIncVat !== null && !isNaN(totalIncVat)) {
    await db
      .update(jobsTable)
      .set({ estimatedValue: String(totalIncVat) })
      .where(eq(jobsTable.id, jobId));
  }
}

router.get("/quotes", async (req, res): Promise<void> => {
  let query = db.select().from(quotesTable).orderBy(desc(quotesTable.createdAt)).$dynamic();
  if (req.query.jobId) {
    query = query.where(eq(quotesTable.jobId, Number(req.query.jobId)));
  }
  const rows = await query;
  res.json(ListQuotesResponse.parse(rows.map(mapQuote)));
});

router.post("/quotes/price-search", async (req, res): Promise<void> => {
  const parsed = SearchMaterialPricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { materials } = parsed.data;

  const prompt = `You are a UK construction materials pricing expert. For each material, identify its trade category and quote from the most relevant UK online retailer or wholesaler for that category:

ELECTRICAL items (cables, consumer units, sockets, switches, fittings, conduit, MCBs, RCDs, LED drivers, lighting, trunking):
→ Primary: Screwfix (screwfix.com), TLC Direct (tlc-direct.co.uk)
→ Also use: CEF (cef.co.uk), Toolstation (toolstation.com), RS Components (rs-online.com)

PLUMBING & HEATING items (pipes, fittings, valves, radiators, boiler parts, cylinders, taps, waste fittings):
→ Primary: Screwfix (screwfix.com), City Plumbing (cityplumbing.co.uk)
→ Also use: Toolstation (toolstation.com), Wolseley (wolseley.co.uk), Plumbfix (plumbfix.com)

ROOFING items (tiles, slates, battens, felt, flashing, guttering, fascia, soffits, ridge, hip):
→ Primary: Roofbase (roofbase.com), Travis Perkins (travisperkins.co.uk)
→ Also use: Jewson (jewson.co.uk), Eurocell (eurocell.co.uk), National Roofing Supplies

TILES & FLOORING items (ceramic, porcelain, natural stone, adhesive, grout, backer board):
→ Primary: Topps Tiles (toppstiles.co.uk), Tile Giant (tilegiant.co.uk)
→ Also use: CTD Tiles (ctdtiles.co.uk), Screwfix (screwfix.com), Tile Mountain (tilemountain.co.uk)

TIMBER & SHEET MATERIALS (timber, OSB, plywood, MDF, plasterboard, insulation, lintels):
→ Primary: Travis Perkins (travisperkins.co.uk), Jewson (jewson.co.uk)
→ Also use: Buildbase (buildbase.co.uk), B&Q Trade (diy.com), Wickes (wickes.co.uk)

DECORATING items (paint, filler, primer, masking tape, brushes, rollers, wallpaper):
→ Primary: Brewers Decorator Centres (brewers.co.uk), Screwfix (screwfix.com)
→ Also use: Toolstation (toolstation.com), Dulux Decorator Centre (duluxdecoratorcentre.co.uk)

GENERAL BUILDING items (bricks, blocks, sand, cement, aggregates, concrete, DPC, cavity wall ties):
→ Primary: Jewson (jewson.co.uk), Travis Perkins (travisperkins.co.uk)
→ Also use: Buildbase (buildbase.co.uk), Aggregate Industries, Hanson Building Materials

Return ONLY valid JSON matching this exact structure:
{
  "materials": [
    {
      "name": "material name",
      "quantity": number,
      "unit": "unit",
      "unitPrice": number (GBP per unit, ex-VAT),
      "source": "Retailer Name",
      "sourceUrl": "https://actual-store-url.co.uk/product-search-or-category-page",
      "total": number (unitPrice * quantity),
      "confidence": "high" | "medium" | "low"
    }
  ],
  "grandTotal": number,
  "disclaimer": "string"
}

Materials to price:
${materials.map((m: { name: string; quantity: number; unit: string }) => `- ${m.quantity} ${m.unit} of ${m.name}`).join("\n")}

These are unverified suggested prices, not a live supplier search. Do not claim that any retailer price has been fetched or confirmed. Use realistic estimated UK prices in GBP ex-VAT, preserve the supplied names, quantities and units, and use only retailer search/category links. The disclaimer must say prices are AI estimates, not verified live quotes, and must be checked and edited by the contractor.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 2048,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(500).json({ error: "AI returned invalid response" });
    return;
  }

  const parsed2 = JSON.parse(jsonMatch[0]);
  parsed2.disclaimer = "Unverified AI price suggestions, excluding VAT. No live supplier pricing has been fetched. Check specification, pack size and price before using.";
  res.json(SearchMaterialPricesResponse.parse(parsed2));
});

router.post("/quotes", guarded(async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { grandTotal, materials, marginPercent, vatPercent, marginAmount, vatAmount, totalIncVat, ...rest } = parsed.data;
  await validateLinks(rest);
  if (rest.workflow) validateWorkflow(rest.workflow, rest.status === "reviewed");
  const [row] = await db
    .insert(quotesTable)
    .values({
      ...rest,
      materials: materials ?? [],
      grandTotal: String(grandTotal ?? 0),
      marginPercent: marginPercent !== undefined ? String(marginPercent) : null,
      vatPercent: vatPercent !== undefined ? String(vatPercent) : null,
      marginAmount: marginAmount !== undefined ? String(marginAmount) : null,
      vatAmount: vatAmount !== undefined ? String(vatAmount) : null,
      totalIncVat: totalIncVat !== undefined ? String(totalIncVat) : null,
      ...(rest.workflow ? financialFields(rest.workflow) : {}),
      reviewedAt: rest.status === "reviewed" ? new Date() : null,
      companySnapshot: rest.status === "reviewed" ? await companySnapshot() : null,
    })
    .returning();

  // Auto-sync job estimatedValue
  if (!row.workflow && row.jobId && row.totalIncVat !== null) {
    await syncJobEstimatedValue(row.jobId, Number(row.totalIncVat));
  }

  res.status(201).json(CreateQuoteResponse.parse(mapQuote(row)));
}));

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetQuoteResponse.parse(mapQuote(row)));
});

router.get("/quotes/:id/history", guarded(async (req, res): Promise<void> => {
  const id = quoteId(req.params.id);
  const versions = await db.select().from(quoteVersionsTable)
    .where(eq(quoteVersionsTable.quoteId, id))
    .orderBy(desc(quoteVersionsTable.revision));
  res.json(versions.map(version => ({
    ...version,
    totalIncVat: version.totalIncVat === null ? null : Number(version.totalIncVat),
    createdAt: version.createdAt.toISOString(),
  })));
}));

router.post("/quotes/:id/ai-edit/preview", guarded(async (req, res): Promise<void> => {
  const id = quoteId(req.params.id);
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 3000) : "";
  const revision = Number(req.body?.revision);
  if (!instruction) throw new QuoteError("Write what you want changed.", 400);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new QuoteError("Reload this quote before asking for an edit.", 400);
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!quote) throw new QuoteError("Quote not found.", 404);
  if (!quote.workflow || !["draft", "reviewed", "changes_requested"].includes(quote.status)) {
    throw new QuoteError("AI edits are only available for saved, editable quotes. Duplicate an accepted quote to revise it.", 409);
  }
  if (quote.revision !== revision) throw new QuoteError("This quote changed elsewhere. Reload it before asking for an edit.", 409);
  try {
    const existing = quote.workflow as QuoteWorkflow;
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_QUOTE_EDIT_MODEL || "gpt-5.6-luna",
      max_completion_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a careful UK trades quote editor. Return JSON only with keys: title, workflow, summary, warnings, priceReviewRequired.
Edit the supplied existing quote in response to the user's instruction; do not start over. Preserve all unrelated fields, customer/site links, VAT settings, deposits, payment terms and known figures. Keep the quote a draft proposal: this endpoint never saves, approves or sends.
Never invent prices, costs, quantities, allowances, measurements, or technical facts. Keep every existing costPrice and sellPrice unchanged for retained line IDs unless the user explicitly gives a new figure. For new or split lines with no defensible existing figure, use zero prices and add a warning that price review is required. When combining lines, only combine compatible units/types; retain the known total by deriving a unit price from the existing line totals where that is mathematically valid, otherwise set the affected price to zero and flag review. Quantity edits may reuse existing unit prices; describe that behavior in a warning if it materially changes totals.
Use concise professional customer-facing wording. Keep the workflow schema exactly compatible with the supplied JSON. IDs for retained sections/items must remain stable; newly created IDs must be unique strings. If the request is ambiguous, preserve the quote and explain the ambiguity in warnings. If a request would change totals because of missing price data, set priceReviewRequired=true.`,
        },
        { role: "user", content: JSON.stringify({ title: quote.title, workflow: existing, instruction }) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("The AI returned an empty quote edit.");
    const parsed = JSON.parse(content) as {
      title?: unknown; workflow?: unknown; summary?: unknown; warnings?: unknown; priceReviewRequired?: unknown;
    };
    const proposedTitle = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 300) : quote.title;
    const proposedWorkflow = parsed.workflow as QuoteWorkflow;
    if (!proposedWorkflow || typeof proposedWorkflow !== "object") throw new Error("The AI response did not contain a quote proposal.");
    validateWorkflow(proposedWorkflow);
    const oldTotals = calculateQuote(existing);
    const newTotals = calculateQuote(proposedWorkflow);
    const priorItems = new Map(existing.sections.flatMap(section => section.items.map(item => [item.id, item] as const)));
    const explicitPriceInput = /\d/.test(instruction) && /(?:\bprice\b|\bcost\b|\bsell\b|\brate\b|\bcharge\b|\bhourly\b|£|\bpounds?\b)/i.test(instruction);
    let unsafePriceChange = false;
    for (const item of proposedWorkflow.sections.flatMap(section => section.items)) {
      const previous = priorItems.get(item.id);
      if (!previous) {
        if (!explicitPriceInput) {
          if (item.costPrice !== 0 || item.sellPrice !== 0) unsafePriceChange = true;
          item.costPrice = 0;
          item.sellPrice = 0;
        } else if (item.costPrice !== 0 || item.sellPrice !== 0) {
          unsafePriceChange = true;
        }
      } else if (item.costPrice !== previous.costPrice || item.sellPrice !== previous.sellPrice) {
        unsafePriceChange = true;
        if (!explicitPriceInput) {
          item.costPrice = previous.costPrice;
          item.sellPrice = previous.sellPrice;
        }
      }
    }
    const totalsAfterPriceGuard = calculateQuote(proposedWorkflow);
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((item): item is string => typeof item === "string").slice(0, 10)
      : [];
    if (unsafePriceChange) warnings.push(explicitPriceInput
      ? "A price was supplied in your instruction. Confirm the AI applied it to the intended line and review the recalculated quote totals."
      : "Unverified AI price changes were removed. Review prices for new or split items before marking the quote reviewed.");
    if (oldTotals.total !== totalsAfterPriceGuard.total && !warnings.length) {
      warnings.push("The proposed scope or quantities change the calculated total. Check each line before approval.");
    }
    res.json({
      title: proposedTitle || quote.title,
      workflow: proposedWorkflow,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "Review the proposed quote changes.",
      warnings: [...new Set(warnings)],
      priceReviewRequired: parsed.priceReviewRequired === true || unsafePriceChange || totalsAfterPriceGuard.total !== oldTotals.total,
      currentTotal: oldTotals.total,
      proposedTotal: totalsAfterPriceGuard.total,
      revision: quote.revision,
    });
  } catch (error) {
    if (error instanceof QuoteError) throw error;
    throw new QuoteError(error instanceof Error ? error.message : "Could not prepare an AI quote edit.", 502);
  }
}));

router.patch("/quotes/:id", guarded(async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = quoteId(req.params.id);
  await validateLinks(parsed.data);
  const row = await db.transaction(async tx => {
  await tx.execute(sql`SELECT id FROM quotes WHERE id = ${id} FOR UPDATE`);
  const [current] = await tx.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!current) throw new QuoteError("Quote not found.", 404);
  const { grandTotal, materials, marginPercent, vatPercent, marginAmount, vatAmount, totalIncVat, revision, ...rest } = parsed.data;
  const contentKeys = ["title", "workflow", "contactId", "callId"] as const;
  const contentChanged = contentKeys.some(key => rest[key] !== undefined && JSON.stringify(rest[key]) !== JSON.stringify(current[key]));
  const moneyTouched = [grandTotal, materials, marginPercent, vatPercent, marginAmount, vatAmount, totalIncVat].some(value => value !== undefined);
  if (current.workflow && (contentChanged || rest.status !== undefined || moneyTouched) && revision !== current.revision) {
    throw new QuoteError("This quote changed in another session. Reload it before saving.", 409);
  }
  if (current.status === "accepted" && (contentChanged || moneyTouched || (rest.status !== undefined && rest.status !== "accepted"))) {
    throw new QuoteError("Accepted quotes are locked. Duplicate this quote for changes.", 409);
  }
  if (rest.status === "accepted" && (current.status !== "reviewed" || contentChanged || moneyTouched)) {
    if (current.status !== "accepted") throw new QuoteError("Save and review the quote before recording acceptance.");
  }
  const workflow = rest.workflow ?? current.workflow as QuoteWorkflow | null;
  let status = rest.status ?? current.status;
   if ((contentChanged || moneyTouched) && ["reviewed", "changes_requested"].includes(current.status) && rest.status !== "reviewed") status = "draft";
  if (status !== "draft" && !workflow) throw new QuoteError("Open this legacy quote for editing and review it before acceptance.");
  if (workflow) validateWorkflow(workflow, status === "reviewed");
  const updateData: Record<string, unknown> = { ...rest, status, revision: current.revision + 1 };
   if ((contentChanged || moneyTouched) && current.workflow) {
     await tx.insert(quoteVersionsTable).values({
       quoteId: current.id,
       revision: current.revision,
       title: current.title,
       status: current.status,
       workflow: current.workflow,
       totalIncVat: current.totalIncVat,
     }).onConflictDoNothing();
   }
   if (contentChanged || moneyTouched || rest.status === "reviewed" || (rest.status !== undefined && rest.status !== current.status)) {
     Object.assign(updateData, { acceptanceTokenHash: null, sharedAt: null, respondedAt: null, changeRequest: null });
   }
  if (materials !== undefined) updateData.materials = materials;
  if (grandTotal !== undefined) updateData.grandTotal = String(grandTotal);
  if (marginPercent !== undefined) updateData.marginPercent = marginPercent !== null ? String(marginPercent) : null;
  if (vatPercent !== undefined) updateData.vatPercent = vatPercent !== null ? String(vatPercent) : null;
  if (marginAmount !== undefined) updateData.marginAmount = marginAmount !== null ? String(marginAmount) : null;
  if (vatAmount !== undefined) updateData.vatAmount = vatAmount !== null ? String(vatAmount) : null;
  if (totalIncVat !== undefined) updateData.totalIncVat = totalIncVat !== null ? String(totalIncVat) : null;
  if (workflow) Object.assign(updateData, financialFields(workflow));
  if (status === "draft") Object.assign(updateData, { reviewedAt: null, acceptedAt: null, companySnapshot: null });
  if (status === "reviewed") Object.assign(updateData, { reviewedAt: new Date(), acceptedAt: null, companySnapshot: await companySnapshot() });
  if (status === "accepted" && current.status !== "accepted") updateData.acceptedAt = new Date();
  const [updated] = await tx
    .update(quotesTable)
    .set(updateData)
    .where(eq(quotesTable.id, params.data.id))
    .returning();
  return updated;
  });

  // Auto-sync job estimatedValue when quote is linked to a job
  if (row.jobId && row.totalIncVat !== null && (!row.workflow || row.status === "accepted")) {
    await syncJobEstimatedValue(row.jobId, Number(row.totalIncVat));
  }

  res.json(UpdateQuoteResponse.parse(mapQuote(row)));
}));

router.post("/quotes/:id/duplicate", guarded(async (req, res) => {
  const id = quoteId(req.params.id);
  const [original] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!original) throw new QuoteError("Quote not found.", 404);
  const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = original;
  const [draft] = await db.insert(quotesTable).values({
    ...copy, title: `${original.title} (copy)`, status: "draft", revision: 1,
    reviewedAt: null, acceptedAt: null, companySnapshot: null,
     acceptanceTokenHash: null, sharedAt: null, respondedAt: null, changeRequest: null,
  }).returning();
  res.status(201).json(CreateQuoteResponse.parse(mapQuote(draft)));
}));

router.post("/quotes/:id/convert-invoice", guarded(async (req, res) => {
  const invoice = await acceptedQuoteToInvoice(quoteId(req.params.id));
  res.json(GetInvoiceResponse.parse({
    ...invoice, subtotal: Number(invoice.subtotal), vatPercent: Number(invoice.vatPercent),
    vatAmount: Number(invoice.vatAmount), total: Number(invoice.total), createdAt: invoice.createdAt.toISOString(),
  }));
}));

router.post("/quotes/:id/convert-job", guarded(async (req, res) => {
  const id = quoteId(req.params.id);
  const input = ConvertQuoteToJobBody.safeParse(req.body);
  if (!input.success || !Number.isFinite(new Date(input.data.scheduledAt).getTime())) throw new QuoteError("Choose a valid job date and time.");
  const job = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM quotes WHERE id = ${id} FOR UPDATE`);
    const [quote] = await tx.select().from(quotesTable).where(eq(quotesTable.id, id));
    if (!quote) throw new QuoteError("Quote not found.", 404);
    if (quote.status !== "accepted" || !quote.workflow) throw new QuoteError("Review and accept this quote before creating a job.");
    if (quote.jobId) {
      const [existing] = await tx.select().from(jobsTable).where(eq(jobsTable.id, quote.jobId));
      if (!existing) throw new QuoteError("The linked job no longer exists. Resolve its link before conversion.", 409);
      return existing;
    }
    const workflow = quote.workflow as QuoteWorkflow;
    if (!workflow.customerPhone.trim()) throw new QuoteError("A customer phone number is needed to schedule a job. Duplicate the accepted quote to add it.");
    const [company] = await tx.select().from(companiesTable).limit(1);
    const [created] = await tx.insert(jobsTable).values({
      title: quote.title, description: workflow.scope, status: "scheduled",
      scheduledAt: new Date(input.data.scheduledAt),
      contactName: workflow.customerName, contactPhone: workflow.customerPhone,
      contactId: quote.contactId, companyId: company?.id, serviceType: "Quoted work",
      address: workflow.siteAddress, estimatedValue: quote.totalIncVat,
      notes: `Accepted quote Q-${String(id).padStart(4, "0")}.`,
    }).returning();
    await tx.update(quotesTable).set({ jobId: created.id, revision: quote.revision + 1 }).where(eq(quotesTable.id, id));
    // If the invoice was created first, carry the new job link through without repricing.
    await tx.update(invoicesTable).set({ jobId: created.id }).where(eq(invoicesTable.quoteId, id));
    return created;
  });
  res.json(GetJobResponse.parse({
    ...job, estimatedValue: job.estimatedValue === null ? null : Number(job.estimatedValue),
    scheduledAt: job.scheduledAt.toISOString(), createdAt: job.createdAt.toISOString(),
  }));
}));

router.delete("/quotes/:id", guarded(async (req, res): Promise<void> => {
  const params = DeleteQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  const linkedInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.quoteId, params.data.id));
  if (quote?.status === "accepted" || linkedInvoices.length) throw new QuoteError("Keep accepted or invoiced quotes for the audit trail. Duplicate them instead of deleting.", 409);
  await db.delete(quotesTable).where(eq(quotesTable.id, params.data.id));
  res.status(204).end();
}));

export default router;

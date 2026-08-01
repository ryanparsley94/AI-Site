import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, quotesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
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
} from "@workspace/api-zod";

const router = Router();

function mapQuote(q: typeof quotesTable.$inferSelect) {
  return {
    ...q,
    grandTotal: Number(q.grandTotal),
    materials: Array.isArray(q.materials) ? q.materials : [],
    createdAt: q.createdAt.toISOString(),
  };
}

router.get("/quotes", async (req, res): Promise<void> => {
  const rows = await db.select().from(quotesTable).orderBy(desc(quotesTable.createdAt));
  res.json(ListQuotesResponse.parse(rows.map(mapQuote)));
});

router.post("/quotes/price-search", async (req, res): Promise<void> => {
  const parsed = SearchMaterialPricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { materials } = parsed.data;

  const prompt = `You are a construction materials pricing expert. For each material below, provide realistic current US market price estimates from major suppliers (Home Depot, Lowe's, 84 Lumber, Menards, etc.).

Return ONLY valid JSON matching this exact structure:
{
  "materials": [
    {
      "name": "material name",
      "quantity": number,
      "unit": "unit",
      "unitPrice": number (USD per unit),
      "source": "Supplier Name",
      "sourceUrl": "https://example.com",
      "total": number (unitPrice * quantity),
      "confidence": "high" | "medium" | "low"
    }
  ],
  "grandTotal": number,
  "disclaimer": "string"
}

Materials to price:
${materials.map((m: { name: string; quantity: number; unit: string }) => `- ${m.quantity} ${m.unit} of ${m.name}`).join("\n")}

Use realistic current market prices. Set confidence to "high" for common materials, "medium" for specialty items, "low" for unusual items. The disclaimer should note these are estimates and prices vary by location and supplier.`;

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
  res.json(SearchMaterialPricesResponse.parse(parsed2));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { grandTotal, materials, ...rest } = parsed.data;
  const [row] = await db
    .insert(quotesTable)
    .values({
      ...rest,
      materials: materials ?? [],
      grandTotal: String(grandTotal ?? 0),
    })
    .returning();
  res.status(201).json(CreateQuoteResponse.parse(mapQuote(row)));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetQuoteResponse.parse(mapQuote(row)));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { grandTotal, materials, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (materials !== undefined) updateData.materials = materials;
  if (grandTotal !== undefined) updateData.grandTotal = String(grandTotal);
  const [row] = await db
    .update(quotesTable)
    .set(updateData)
    .where(eq(quotesTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateQuoteResponse.parse(mapQuote(row)));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const params = DeleteQuoteParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(quotesTable).where(eq(quotesTable.id, params.data.id));
  res.status(204).end();
});

export default router;

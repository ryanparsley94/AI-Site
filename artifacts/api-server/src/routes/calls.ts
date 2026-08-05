import { Router } from "express";
import { and, eq, desc, sql, ne } from "drizzle-orm";
import { db, callsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ListCallsResponse,
  GetCallParams,
  GetCallResponse,
  UpdateCallParams,
  UpdateCallBody,
  UpdateCallResponse,
  DeleteCallParams,
  GetCallStatsResponse,
} from "@workspace/api-zod";

const router = Router();

function mapCall(c: typeof callsTable.$inferSelect) {
  return {
    ...c,
    transcript: Array.isArray(c.transcript) ? c.transcript : [],
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/calls/stats", async (req, res): Promise<void> => {
  const all = await db.select().from(callsTable);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const totalCalls = all.length;
  const bookedCalls = all.filter((c) => c.status === "booked").length;
  const missedCalls = all.filter((c) => c.status === "missed").length;
  const transferredCalls = all.filter((c) => c.status === "transferred").length;
  const totalDuration = all.reduce((sum, c) => sum + c.duration, 0);
  const averageDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
  const bookingRate = totalCalls > 0 ? Math.round((bookedCalls / totalCalls) * 100) / 100 : 0;
  const callsToday = all.filter((c) => c.createdAt >= startOfDay).length;
  const callsThisWeek = all.filter((c) => c.createdAt >= startOfWeek).length;

  res.json(GetCallStatsResponse.parse({
    totalCalls, bookedCalls, missedCalls, transferredCalls,
    averageDuration, bookingRate, callsToday, callsThisWeek,
  }));
});

router.get("/calls", async (req, res): Promise<void> => {
  // Build predicates and combine with and() so both conditions apply together
  const conditions: Parameters<typeof and> = [];

  if (req.query.status && req.query.status !== "all") {
    conditions.push(eq(callsTable.status, req.query.status as string));
  }

  const source = req.query.source as string | undefined;
  if (source === "widget") {
    conditions.push(eq(callsTable.assistantName, "Website Widget"));
  } else if (source === "phone") {
    conditions.push(ne(callsTable.assistantName, "Website Widget"));
  }

  let query = db.select().from(callsTable).orderBy(desc(callsTable.createdAt)).$dynamic();
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const limit = Number(req.query.limit) || 50;
  query = query.limit(limit);

  const rows = await query;
  res.json(ListCallsResponse.parse(rows.map(mapCall)));
});

router.get("/calls/:id", async (req, res): Promise<void> => {
  const params = GetCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(callsTable).where(eq(callsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetCallResponse.parse(mapCall(row)));
});

router.patch("/calls/:id", async (req, res): Promise<void> => {
  const params = UpdateCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateCallBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(callsTable)
    .set(parsed.data)
    .where(eq(callsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateCallResponse.parse(mapCall(row)));
});

router.delete("/calls/:id", async (req, res): Promise<void> => {
  const params = DeleteCallParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(callsTable).where(eq(callsTable.id, params.data.id));
  res.status(204).end();
});

// AI extract quote — derives materials + scope from a call transcript
router.post("/calls/:id/extract-quote", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, id));
  if (!call) { res.status(404).json({ error: "Not found" }); return; }

  const transcriptText = Array.isArray(call.transcript)
    ? (call.transcript as { speaker: string; text: string }[])
        .map((t) => `${t.speaker === "caller" ? "Customer" : "AI"}: ${t.text}`)
        .join("\n")
    : "";

  const contextParts = [
    call.callerName && `Customer: ${call.callerName}`,
    call.callerPhone && `Phone: ${call.callerPhone}`,
    call.outcome && `AI Outcome Summary: ${call.outcome}`,
    call.notes && `Internal Notes: ${call.notes}`,
    transcriptText && `Call Transcript:\n${transcriptText}`,
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a construction estimating assistant. Based on the call below, extract the materials and supplies the customer is likely to need for their project.

${contextParts || "No transcript or notes available — make reasonable guesses for a general construction inquiry."}

Return ONLY valid JSON in this exact structure:
{
  "suggestedTitle": "short quote title based on the job type (e.g. 'Deck Build — Smith Residence')",
  "materials": [
    { "name": "material name", "quantity": number, "unit": "unit of measure" }
  ]
}

Rules:
- Include 3–8 realistic materials based on the job type discussed
- Use standard construction units (board ft, sq ft, bags, linear ft, each, rolls, sheets)
- If the call mentions a specific project, tailor materials to it
- If the call is vague, suggest common materials for residential construction
- suggestedTitle should include the customer name if available`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.status(500).json({ error: "AI returned invalid response" }); return; }

  const result = JSON.parse(jsonMatch[0]);
  res.json(result);
});

export default router;

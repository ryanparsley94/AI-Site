import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, marketingDraftsTable, companiesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ListMarketingDraftsResponse,
  GenerateMarketingDraftsBody,
  GenerateMarketingDraftsResponse,
  UpdateMarketingDraftParams,
  UpdateMarketingDraftBody,
  UpdateMarketingDraftResponse,
  ApproveMarketingDraftParams,
  ApproveMarketingDraftResponse,
  DismissMarketingDraftParams,
  DismissMarketingDraftResponse,
  DeleteMarketingDraftParams,
} from "@workspace/api-zod";

const router = Router();

function mapDraft(d: typeof marketingDraftsTable.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
  };
}

async function getCompanyName(): Promise<string> {
  try {
    const [company] = await db.select().from(companiesTable).limit(1);
    return company?.name ?? "our team";
  } catch {
    return "our team";
  }
}

async function draftMessage(
  type: "review_request" | "followup",
  jobTitle: string,
  clientName: string,
  companyName: string,
): Promise<string> {
  const prompt =
    type === "review_request"
      ? `You are a marketing assistant for a UK trade business called "${companyName}".
Draft a short, warm SMS or message to a client named ${clientName} after completing a job: "${jobTitle}".
The message should:
- Thank them for choosing us
- Ask them to leave a Google review (mention it takes 30 seconds)
- Keep it under 160 characters (SMS length)
- Sound natural and personal, not corporate
- Do NOT include a URL placeholder or [link] — just describe leaving a Google review
Output only the message text, no labels or quotes.`
      : `You are a marketing assistant for a UK trade business called "${companyName}".
Draft a short follow-up message to a client named ${clientName} after completing a job: "${jobTitle}".
The message should:
- Check they are happy with the work
- Mention we are always available for future jobs or referrals
- Keep it under 160 characters (SMS length)
- Sound warm and personal
Output only the message text, no labels or quotes.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 200,
    temperature: 0.7,
  });

  return resp.choices[0]?.message?.content?.trim() ?? "";
}

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/marketing-drafts", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  let query = db
    .select()
    .from(marketingDraftsTable)
    .orderBy(desc(marketingDraftsTable.createdAt))
    .$dynamic();

  if (status && status !== "all") {
    query = query.where(eq(marketingDraftsTable.status, status));
  }

  const rows = await query;
  res.json(ListMarketingDraftsResponse.parse(rows.map(mapDraft)));
});

// ─── Generate drafts for a completed job ─────────────────────────────────────

router.post("/marketing-drafts/generate", async (req, res): Promise<void> => {
  const parsed = GenerateMarketingDraftsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { jobId, jobTitle, clientName, clientPhone, companyName } = parsed.data;

  // Guard: return existing drafts if already generated for this job
  const existing = await db
    .select()
    .from(marketingDraftsTable)
    .where(eq(marketingDraftsTable.jobId, jobId));
  if (existing.length > 0) {
    res.status(200).json(GenerateMarketingDraftsResponse.parse(existing.map(mapDraft)));
    return;
  }

  // Insert placeholder rows first so the UI sees them immediately.
  // ON CONFLICT DO NOTHING is the server-side guard for concurrent requests.
  const insertValues = [
    { jobId, jobTitle, clientName, clientPhone: clientPhone ?? null, companyName, type: "review_request" as const, status: "pending" as const, draftMessage: null, editedMessage: null },
    { jobId, jobTitle, clientName, clientPhone: clientPhone ?? null, companyName, type: "followup" as const, status: "pending" as const, draftMessage: null, editedMessage: null },
  ];

  let inserted: (typeof marketingDraftsTable.$inferSelect)[];
  try {
    inserted = await db.insert(marketingDraftsTable).values(insertValues).returning();
  } catch (err: unknown) {
    // Unique-constraint violation — a concurrent request already inserted these rows
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const rows = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.jobId, jobId));
      res.status(200).json(GenerateMarketingDraftsResponse.parse(rows.map(mapDraft)));
      return;
    }
    throw err;
  }

  // Draft AI messages fire-and-forget so the HTTP response is fast.
  // On failure the draftMessage sentinel "__FAILED__" is written so the UI
  // can show a terminal error state instead of spinning indefinitely.
  for (const row of inserted) {
    (async () => {
      try {
        const msg = await draftMessage(
          row.type as "review_request" | "followup",
          jobTitle,
          clientName,
          companyName,
        );
        await db
          .update(marketingDraftsTable)
          .set({ draftMessage: msg })
          .where(eq(marketingDraftsTable.id, row.id));
      } catch (err) {
        console.error(`Failed to draft marketing message for draft ${row.id}:`, err);
        // Write failure sentinel so the UI exits the polling/loading state
        await db
          .update(marketingDraftsTable)
          .set({ draftMessage: "__FAILED__" })
          .where(eq(marketingDraftsTable.id, row.id))
          .catch(() => { /* best-effort */ });
      }
    })();
  }

  res.status(201).json(GenerateMarketingDraftsResponse.parse(inserted.map(mapDraft)));
});

// ─── Update (edit message) ────────────────────────────────────────────────────

router.patch("/marketing-drafts/:id", async (req, res): Promise<void> => {
  const params = UpdateMarketingDraftParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateMarketingDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(marketingDraftsTable)
    .set(parsed.data)
    .where(eq(marketingDraftsTable.id, params.data.id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateMarketingDraftResponse.parse(mapDraft(row)));
});

// ─── Approve ──────────────────────────────────────────────────────────────────

router.post("/marketing-drafts/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveMarketingDraftParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(marketingDraftsTable)
    .set({ status: "approved" })
    .where(
      and(
        eq(marketingDraftsTable.id, params.data.id),
        eq(marketingDraftsTable.status, "pending"),
      )
    )
    .returning();

  if (!row) {
    const [existing] = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Not found" }); }
    else { res.status(409).json({ error: `Draft is already ${existing.status}` }); }
    return;
  }

  res.json(ApproveMarketingDraftResponse.parse(mapDraft(row)));
});

// ─── Dismiss ──────────────────────────────────────────────────────────────────

router.post("/marketing-drafts/:id/dismiss", async (req, res): Promise<void> => {
  const params = DismissMarketingDraftParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(marketingDraftsTable)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(marketingDraftsTable.id, params.data.id),
        eq(marketingDraftsTable.status, "pending"),
      )
    )
    .returning();

  if (!row) {
    const [existing] = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Not found" }); }
    else { res.status(409).json({ error: `Draft is already ${existing.status}` }); }
    return;
  }

  res.json(DismissMarketingDraftResponse.parse(mapDraft(row)));
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/marketing-drafts/:id", async (req, res): Promise<void> => {
  const params = DeleteMarketingDraftParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(marketingDraftsTable).where(eq(marketingDraftsTable.id, params.data.id));
  res.status(204).end();
});

export { draftMessage, getCompanyName };
export default router;

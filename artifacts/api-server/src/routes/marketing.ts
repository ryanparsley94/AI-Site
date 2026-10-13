import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { db, marketingDraftsTable, companiesTable, jobsTable, contactsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { checkMarketingDelivery, sendMarketingMessage, validateMarketingDelivery } from "../lib/marketing-delivery";
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
    sentAt: d.sentAt?.toISOString() ?? null,
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
  // Provider acceptance is not proof of delivery. Refresh outstanding receipts.
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map(async (row) => {
      if (row.deliveryStatus === "sending" && Date.now() - row.updatedAt.getTime() > 120000) {
        const [saved] = await db.update(marketingDraftsTable).set({
          deliveryStatus: "unknown", deliveryError: "Sending was interrupted. It may have been sent. Check the provider before sending again.",
        }).where(and(eq(marketingDraftsTable.id, row.id), eq(marketingDraftsTable.deliveryStatus, "sending"), eq(marketingDraftsTable.deliveryVersion, row.deliveryVersion))).returning();
        if (saved) Object.assign(row, saved);
      } else if (row.providerMessageId && ["queued", "sent"].includes(row.deliveryStatus)) {
        const result = await checkMarketingDelivery(row.channel, row.providerMessageId);
        if (result && (result.deliveryStatus !== row.deliveryStatus || result.deliveryError !== row.deliveryError)) {
          const [saved] = await db.update(marketingDraftsTable).set(result).where(and(eq(marketingDraftsTable.id, row.id), eq(marketingDraftsTable.providerMessageId, row.providerMessageId), eq(marketingDraftsTable.deliveryVersion, row.deliveryVersion))).returning();
          if (saved) Object.assign(row, saved);
        }
      }
    }));
  }
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
  const [contact] = await db.select({ email: contactsTable.email }).from(jobsTable)
    .innerJoin(contactsTable, eq(jobsTable.contactId, contactsTable.id)).where(eq(jobsTable.id, jobId));

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
    inserted = await db.insert(marketingDraftsTable).values(insertValues.map(value => ({ ...value, clientEmail: contact?.email ?? null }))).returning();
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
        logger.error({ err, draftId: row.id }, "Failed to draft marketing message");
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
    .set({ ...parsed.data, deliveryVersion: sql`${marketingDraftsTable.deliveryVersion} + 1` })
    .where(and(eq(marketingDraftsTable.id, params.data.id), inArray(marketingDraftsTable.status, ["pending", "approved"]), inArray(marketingDraftsTable.deliveryStatus, ["not_sent", "failed"])))
    .returning();

  if (!row) { res.status(409).json({ error: "Draft not found or cannot be edited after sending." }); return; }
  res.json(UpdateMarketingDraftResponse.parse(mapDraft(row)));
});

// ─── Approve ──────────────────────────────────────────────────────────────────

router.post("/marketing-drafts/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveMarketingDraftParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [draft] = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.id, params.data.id));
  if (!draft) { res.status(404).json({ error: "Not found" }); return; }
  if (!["pending", "approved"].includes(draft.status) || !["not_sent", "failed"].includes(draft.deliveryStatus)) {
    res.status(409).json({ error: "This draft has already been sent or is awaiting confirmation. It cannot be sent again." }); return;
  }
  const message = draft.editedMessage ?? draft.draftMessage;
  const error = await validateMarketingDelivery(draft.channel, draft.clientPhone, draft.clientEmail, message);
  if (error) {
    const [failed] = await db.update(marketingDraftsTable).set({ deliveryStatus: "failed", deliveryError: error, deliveryVersion: sql`${marketingDraftsTable.deliveryVersion} + 1` })
      .where(and(eq(marketingDraftsTable.id, draft.id), eq(marketingDraftsTable.status, draft.status), eq(marketingDraftsTable.deliveryVersion, draft.deliveryVersion))).returning();
    if (!failed) { res.status(409).json({ error: "Draft changed. Refresh and try again." }); return; }
    res.json(ApproveMarketingDraftResponse.parse(mapDraft(failed))); return;
  }

  const [row] = await db
    .update(marketingDraftsTable)
    .set({ status: "approved", deliveryStatus: "sending", deliveryError: null, providerMessageId: null, sentAt: null, deliveryVersion: sql`${marketingDraftsTable.deliveryVersion} + 1` })
    .where(
      and(
        eq(marketingDraftsTable.id, params.data.id),
        inArray(marketingDraftsTable.status, ["pending", "approved"]),
        inArray(marketingDraftsTable.deliveryStatus, ["not_sent", "failed"]),
        eq(marketingDraftsTable.deliveryVersion, draft.deliveryVersion),
      )
    )
    .returning();

  if (!row) {
    const [existing] = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Not found" }); }
    else { res.status(409).json({ error: `Draft is already ${existing.status}` }); }
    return;
  }

  const result = await sendMarketingMessage(row, message!);
  const [sent] = await db.update(marketingDraftsTable).set({
    ...result, sentAt: result.providerMessageId && result.deliveryStatus !== "failed" ? new Date() : null,
  }).where(and(eq(marketingDraftsTable.id, row.id), eq(marketingDraftsTable.deliveryVersion, row.deliveryVersion))).returning();
  if (!sent) { res.status(409).json({ error: "Delivery state changed. Refresh to check the receipt." }); return; }
  res.json(ApproveMarketingDraftResponse.parse(mapDraft(sent)));
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

  const [row] = await db.delete(marketingDraftsTable).where(and(eq(marketingDraftsTable.id, params.data.id), inArray(marketingDraftsTable.deliveryStatus, ["not_sent", "failed"]))).returning();
  if (!row) { res.status(409).json({ error: "Sent or unconfirmed messages must be retained as delivery records." }); return; }
  res.status(204).end();
});

export { draftMessage, getCompanyName };
export default router;

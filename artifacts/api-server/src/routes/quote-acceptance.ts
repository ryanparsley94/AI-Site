import { Router, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, quotesTable, jobsTable } from "@workspace/db";
import {
  CreateQuoteAcceptanceLinkResponse, GetPublicQuoteParams, RespondToPublicQuoteBody,
  type QuoteWorkflow,
} from "@workspace/api-zod";
import { QuoteError, quoteId } from "../lib/quote-workflow";
import { assertShareable, newAcceptanceToken, publicQuote, quoteExpired, tokenHash } from "../lib/quote-acceptance";

const guarded = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").set("X-Robots-Tag", "noindex, nofollow");
  try { await fn(req, res); }
  catch (e) { if (e instanceof QuoteError) { res.status(e.status).json({ error: e.message }); return; } throw e; }
};
export const quoteSharingRouter = Router();
export const publicQuoteRouter = Router();

quoteSharingRouter.post("/quotes/:id/acceptance-link", guarded(async (req, res) => {
  const id = quoteId(req.params.id);
  const token = newAcceptanceToken();
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM quotes WHERE id = ${id} FOR UPDATE`);
    const [q] = await tx.select().from(quotesTable).where(eq(quotesTable.id, id));
    if (!q) throw new QuoteError("Quote not found.", 404);
    assertShareable(q);
    publicQuote(q); // Refuse to share inconsistent commercial totals.
    await tx.update(quotesTable).set({
      acceptanceTokenHash: tokenHash(token), sharedAt: new Date(),
      respondedAt: null, changeRequest: null, revision: q.revision + 1,
    }).where(eq(quotesTable.id, id));
  });
  res.json(CreateQuoteAcceptanceLinkResponse.parse({ path: `/quote/accept/${token}` }));
}));

function parseToken(req: Request) {
  const p = GetPublicQuoteParams.safeParse(req.params);
  if (!p.success) throw new QuoteError("This quote link is invalid or no longer available.", 404);
  return tokenHash(p.data.token);
}
publicQuoteRouter.get("/public/quotes/:token", guarded(async (req, res) => {
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.acceptanceTokenHash, parseToken(req)));
  if (!q?.workflow || !["reviewed", "accepted", "changes_requested"].includes(q.status)) throw new QuoteError("This quote link is invalid or no longer available.", 404);
  res.json(publicQuote(q));
}));
publicQuoteRouter.post("/public/quotes/:token", guarded(async (req, res) => {
  const hash = parseToken(req);
  const parsed = RespondToPublicQuoteBody.safeParse(req.body);
  if (!parsed.success) throw new QuoteError("Enter a valid quote response.", 400);
  const { action, revision } = parsed.data;
  const message = parsed.data.message?.trim();
  if (action === "request_changes" && !message) throw new QuoteError("Describe the changes you would like.", 400);
  const result = await db.transaction(async tx => {
    // Lock by token before reading so edits, revocations and competing responses serialize.
    await tx.execute(sql`SELECT id FROM quotes WHERE acceptance_token_hash = ${hash} FOR UPDATE`);
    const [q] = await tx.select().from(quotesTable).where(eq(quotesTable.acceptanceTokenHash, hash));
    if (!q?.workflow) throw new QuoteError("This quote link is invalid or no longer available.", 404);
    if (q.status !== "reviewed") throw new QuoteError("A response has already been recorded. Reload to see it.", 409);
    if (q.revision !== revision) throw new QuoteError("This quote has changed. Reload before responding.", 409);
    if (quoteExpired(q.workflow as QuoteWorkflow)) throw new QuoteError("This quote has expired. Contact the contractor for an updated quote.", 409);
    assertShareable(q);
    publicQuote(q);
    const [updated] = await tx.update(quotesTable).set({
      status: action === "accept" ? "accepted" : "changes_requested",
      acceptedAt: action === "accept" ? new Date() : null,
      respondedAt: new Date(), changeRequest: action === "request_changes" ? message : null,
      revision: q.revision + 1,
    }).where(eq(quotesTable.id, q.id)).returning();
    if (action === "accept" && updated.jobId && updated.totalIncVat !== null) {
      await tx.update(jobsTable).set({ estimatedValue: updated.totalIncVat }).where(eq(jobsTable.id, updated.jobId));
    }
    return publicQuote(updated);
  });
  res.json(result);
}));

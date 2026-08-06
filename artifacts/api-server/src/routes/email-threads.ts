/**
 * Protected email-thread CRUD routes (require admin session).
 * The public inbound webhook lives in email-threads-inbound.ts.
 */
import { Router } from "express";
import { and, eq, ne, notInArray, desc } from "drizzle-orm";
import { db, emailThreadsTable, companiesTable } from "@workspace/db";
import {
  ListEmailThreadsResponse,
  ListEmailThreadsQueryParams,
  GetEmailThreadResponse,
  UpdateEmailThreadBody,
  UpdateEmailThreadResponse,
  ApproveEmailThreadResponse,
  DismissEmailThreadResponse,
  DeleteEmailThreadParams,
  GetEmailThreadParams,
  UpdateEmailThreadParams,
  ApproveEmailThreadParams,
  DismissEmailThreadParams,
  GetEmailSettingsResponse,
  UpdateEmailSettingsBody,
  UpdateEmailSettingsResponse,
} from "@workspace/api-zod";
import { sendEmailReply } from "./email-threads-inbound";

const router = Router();

function mapThread(t: typeof emailThreadsTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
  };
}

async function getOrCreateCompany() {
  const rows = await db.select().from(companiesTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(companiesTable)
    .values({ name: "Apex Construction Co.", phone: "(555) 800-1234" })
    .returning();
  return created;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/email-threads/settings", async (req, res): Promise<void> => {
  const company = await getOrCreateCompany();
  const inboundUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/email-threads/inbound`
    : `/api/email-threads/inbound`;

  res.json(
    GetEmailSettingsResponse.parse({
      autoSend: company.emailAutoSend,
      forwardingAddress: inboundUrl,
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
    })
  );
});

router.patch("/email-threads/settings", async (req, res): Promise<void> => {
  const parsed = UpdateEmailSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const company = await getOrCreateCompany();
  if (parsed.data.autoSend !== undefined) {
    await db
      .update(companiesTable)
      .set({ emailAutoSend: parsed.data.autoSend })
      .where(eq(companiesTable.id, company.id));
  }
  const updated = await getOrCreateCompany();
  const inboundUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/email-threads/inbound`
    : `/api/email-threads/inbound`;

  res.json(
    UpdateEmailSettingsResponse.parse({
      autoSend: updated.emailAutoSend,
      forwardingAddress: inboundUrl,
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
    })
  );
});

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/email-threads", async (req, res): Promise<void> => {
  const params = ListEmailThreadsQueryParams.safeParse({ status: req.query.status });
  let query = db
    .select()
    .from(emailThreadsTable)
    .orderBy(desc(emailThreadsTable.createdAt))
    .$dynamic();

  const status = (params.success ? params.data.status : undefined) ?? "all";
  if (status && status !== "all") {
    query = query.where(eq(emailThreadsTable.status, status));
  } else {
    // Never expose transient placeholder rows to the UI
    query = query.where(
      notInArray(emailThreadsTable.status, ["processing", "sending"])
    );
  }

  const rows = await query;
  res.json(ListEmailThreadsResponse.parse(rows.map(mapThread)));
});

// ─── Single thread ────────────────────────────────────────────────────────────

router.get("/email-threads/:id", async (req, res): Promise<void> => {
  const params = GetEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(GetEmailThreadResponse.parse(mapThread(row)));
});

router.patch("/email-threads/:id", async (req, res): Promise<void> => {
  const params = UpdateEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateEmailThreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(emailThreadsTable)
    .set(parsed.data)
    .where(eq(emailThreadsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(UpdateEmailThreadResponse.parse(mapThread(row)));
});

router.delete("/email-threads/:id", async (req, res): Promise<void> => {
  const params = DeleteEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(emailThreadsTable)
    .where(eq(emailThreadsTable.id, params.data.id));
  res.status(204).end();
});

// ─── Actions ──────────────────────────────────────────────────────────────────

router.post("/email-threads/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Atomically claim the thread by transitioning pending → sending.
  // Using an intermediate "sending" state prevents dismiss from racing the
  // in-flight provider call: dismiss only accepts "pending" rows, so it will
  // return 409 while the send is in flight.
  const [claimed] = await db
    .update(emailThreadsTable)
    .set({ status: "sending" })
    .where(
      and(
        eq(emailThreadsTable.id, params.data.id),
        eq(emailThreadsTable.status, "pending")
      )
    )
    .returning();

  if (!claimed) {
    const [row] = await db
      .select()
      .from(emailThreadsTable)
      .where(eq(emailThreadsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Not found" });
    } else {
      res.status(409).json({ error: `Thread is already ${row.status}` });
    }
    return;
  }

  const replyBody = claimed.editedReply ?? claimed.aiReply ?? "";

  // Attempt provider delivery. On failure, roll back sending → pending so the
  // user can retry. On success, finalize sending → sent.
  const sent = await sendEmailReply(claimed.fromEmail, claimed.fromName, claimed.subject, replyBody);
  if (!sent) {
    await db
      .update(emailThreadsTable)
      .set({ status: "pending" })
      .where(
        and(
          eq(emailThreadsTable.id, params.data.id),
          eq(emailThreadsTable.status, "sending")
        )
      );
    res.status(503).json({
      error:
        "Email delivery unavailable. Configure RESEND_API_KEY and RESEND_FROM_EMAIL " +
        "to enable outbound sending. The reply draft has been preserved.",
    });
    return;
  }

  const [updated] = await db
    .update(emailThreadsTable)
    .set({ status: "sent" })
    .where(eq(emailThreadsTable.id, params.data.id))
    .returning();

  res.json(ApproveEmailThreadResponse.parse(mapThread(updated ?? claimed)));
});

router.post("/email-threads/:id/dismiss", async (req, res): Promise<void> => {
  const params = DismissEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Only allow dismissing a pending thread. "sending" is in-flight (race guard),
  // "sent" and "dismissed" are terminal states.
  const [updated] = await db
    .update(emailThreadsTable)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(emailThreadsTable.id, params.data.id),
        eq(emailThreadsTable.status, "pending")
      )
    )
    .returning();
  if (!updated) {
    const [row] = await db
      .select()
      .from(emailThreadsTable)
      .where(eq(emailThreadsTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Not found" });
    } else {
      res.status(409).json({ error: `Thread is already ${row.status}` });
    }
    return;
  }
  res.json(DismissEmailThreadResponse.parse(mapThread(updated)));
});

export default router;

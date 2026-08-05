import { Router } from "express";
import { eq, gte, and, lte } from "drizzle-orm";
import { db, jobsTable, quotesTable } from "@workspace/db";
import {
  ListJobsResponse,
  CreateJobBody,
  CreateJobResponse,
  GetUpcomingJobsResponse,
  GetJobParams,
  GetJobResponse,
  UpdateJobParams,
  UpdateJobBody,
  UpdateJobResponse,
  DeleteJobParams,
} from "@workspace/api-zod";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../lib/google-calendar";

const router = Router();

function mapJob(j: typeof jobsTable.$inferSelect) {
  return {
    ...j,
    estimatedValue: j.estimatedValue !== null ? Number(j.estimatedValue) : null,
    scheduledAt: j.scheduledAt.toISOString(),
    createdAt: j.createdAt.toISOString(),
  };
}

router.get("/jobs/upcoming", async (req, res): Promise<void> => {
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(jobsTable)
    .where(and(gte(jobsTable.scheduledAt, now), lte(jobsTable.scheduledAt, inSevenDays)))
    .orderBy(jobsTable.scheduledAt);
  res.json(GetUpcomingJobsResponse.parse(rows.map(mapJob)));
});

router.get("/jobs", async (req, res): Promise<void> => {
  let query = db.select().from(jobsTable).orderBy(jobsTable.scheduledAt).$dynamic();
  if (req.query.status && req.query.status !== "all") {
    query = query.where(eq(jobsTable.status, req.query.status as string));
  }
  const rows = await query;
  res.json(ListJobsResponse.parse(rows.map(mapJob)));
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt, estimatedValue, ...rest } = parsed.data;
  const [row] = await db
    .insert(jobsTable)
    .values({
      ...rest,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      estimatedValue: estimatedValue !== undefined ? String(estimatedValue) : null,
    })
    .returning();

  // Sync to Google Calendar (fire-and-forget — don't fail the request if it fails)
  createCalendarEvent({
    title: row.title,
    contactName: row.contactName,
    address: row.address,
    serviceType: row.serviceType,
    scheduledAt: row.scheduledAt,
    estimatedDuration: row.estimatedDuration,
  }).then(async (eventId) => {
    if (eventId) {
      await db.update(jobsTable).set({ googleEventId: eventId }).where(eq(jobsTable.id, row.id));
    }
  }).catch(() => { /* non-fatal */ });

  res.status(201).json(CreateJobResponse.parse(mapJob(row)));
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetJobResponse.parse(mapJob(row)));
});

router.patch("/jobs/:id", async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt, estimatedValue, quoteId, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);
  if (estimatedValue !== undefined) updateData.estimatedValue = String(estimatedValue);

  // If linking a quote, auto-populate estimatedValue from quote.totalIncVat
  if (quoteId !== undefined && quoteId !== null) {
    const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
    if (quote?.totalIncVat !== null && quote?.totalIncVat !== undefined) {
      updateData.estimatedValue = quote.totalIncVat;
    }
  }

  const [row] = await db
    .update(jobsTable)
    .set(updateData)
    .where(eq(jobsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Sync to Google Calendar if schedule changed
  if (row.googleEventId) {
    updateCalendarEvent(row.googleEventId, {
      title: row.title,
      contactName: row.contactName,
      address: row.address,
      serviceType: row.serviceType,
      scheduledAt: row.scheduledAt,
      estimatedDuration: row.estimatedDuration,
    }).catch(() => { /* non-fatal */ });
  }

  res.json(UpdateJobResponse.parse(mapJob(row)));
});

router.delete("/jobs/:id", async (req, res): Promise<void> => {
  const params = DeleteJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  // Fetch the job first so we can remove its calendar event
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  await db.delete(jobsTable).where(eq(jobsTable.id, params.data.id));

  if (job?.googleEventId) {
    deleteCalendarEvent(job.googleEventId).catch(() => { /* non-fatal */ });
  }

  res.status(204).end();
});

export default router;

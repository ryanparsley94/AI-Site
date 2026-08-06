import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, contactsTable, jobsTable, emailThreadsTable } from "@workspace/db";
import {
  ListContactsResponse,
  CreateContactBody,
  CreateContactResponse,
  GetContactParams,
  GetContactResponse,
  UpdateContactParams,
  UpdateContactBody,
  UpdateContactResponse,
  DeleteContactParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichContact(c: typeof contactsTable.$inferSelect) {
  const [jobs, emailThreads] = await Promise.all([
    db.select().from(jobsTable).where(eq(jobsTable.contactId, c.id)),
    db
      .select({
        id: emailThreadsTable.id,
        subject: emailThreadsTable.subject,
        status: emailThreadsTable.status,
        createdAt: emailThreadsTable.createdAt,
      })
      .from(emailThreadsTable)
      .where(eq(emailThreadsTable.contactId, c.id)),
  ]);

  const totalSpent = jobs
    .filter((j) => j.status === "completed" && j.estimatedValue)
    .reduce((sum, j) => sum + Number(j.estimatedValue ?? 0), 0);

  return {
    ...c,
    totalJobs: jobs.length,
    totalSpent,
    createdAt: c.createdAt.toISOString(),
    emailThreads: emailThreads.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

router.get("/contacts", async (req, res): Promise<void> => {
  let query = db.select().from(contactsTable).orderBy(contactsTable.createdAt).$dynamic();
  if (req.query.type && req.query.type !== "all") {
    query = query.where(eq(contactsTable.type, req.query.type as string));
  }
  const rows = await query;
  const enriched = await Promise.all(rows.map(enrichContact));
  res.json(ListContactsResponse.parse(enriched));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(contactsTable).values(parsed.data).returning();
  const enriched = await enrichContact(row);
  res.status(201).json(CreateContactResponse.parse(enriched));
});

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichContact(row);
  res.json(GetContactResponse.parse(enriched));
});

router.patch("/contacts/:id", async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(contactsTable)
    .set(parsed.data)
    .where(eq(contactsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichContact(row);
  res.json(UpdateContactResponse.parse(enriched));
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contactsTable).where(eq(contactsTable.id, params.data.id));
  res.status(204).end();
});

export default router;

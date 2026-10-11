import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, pool, contactsTable, contactSitesTable, jobsTable, emailThreadsTable } from "@workspace/db";
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

async function currentCompanyId(): Promise<number> {
  const company = await pool.query<{ id: number }>(
    "SELECT id FROM companies ORDER BY id LIMIT 1",
  );
  if (!company.rows[0]) throw new Error("Business profile is not configured.");
  return company.rows[0].id;
}

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
  const companyId = await currentCompanyId();
  const conditions = [eq(contactsTable.companyId, companyId)];
  if (req.query.type && req.query.type !== "all") {
    conditions.push(eq(contactsTable.type, req.query.type as string));
  }
  const rows = await db
    .select()
    .from(contactsTable)
    .where(and(...conditions))
    .orderBy(contactsTable.createdAt);
  const enriched = await Promise.all(rows.map(enrichContact));
  res.json(ListContactsResponse.parse(enriched));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const companyId = await currentCompanyId();
  const [row] = await db.insert(contactsTable).values({ ...parsed.data, companyId }).returning();
  const enriched = await enrichContact(row);
  res.status(201).json(CreateContactResponse.parse(enriched));
});

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = await currentCompanyId();
  const [row] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.companyId, companyId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichContact(row);
  res.json(GetContactResponse.parse(enriched));
});

router.get("/contacts/:id/sites", async (req, res): Promise<void> => {
  const contactId = Number(req.params.id);
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    res.status(400).json({ error: "Invalid contact id" });
    return;
  }
  const companyId = await currentCompanyId();
  const rows = await db
    .select()
    .from(contactSitesTable)
    .where(and(eq(contactSitesTable.contactId, contactId), eq(contactSitesTable.companyId, companyId)))
    .orderBy(contactSitesTable.createdAt);
  res.json(rows.map((site) => ({
    ...site,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  })));
});

router.post("/contacts/:id/sites", async (req, res): Promise<void> => {
  const contactId = Number(req.params.id);
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    res.status(400).json({ error: "Invalid contact id" });
    return;
  }
  const companyId = await currentCompanyId();
  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.companyId, companyId)));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) {
    res.status(400).json({ error: "Site name is required" });
    return;
  }
  const clean = (key: string, max = 500) =>
    typeof body[key] === "string" && body[key].trim()
      ? body[key].trim().slice(0, max)
      : null;
  const [site] = await db.insert(contactSitesTable).values({
    companyId,
    contactId,
    name,
    addressStreet: clean("addressStreet"),
    city: clean("city"),
    region: clean("region"),
    postcode: clean("postcode", 50),
    country: clean("country", 100),
    phone: clean("phone", 100),
    notes: clean("notes", 2000),
    source: "manual",
  }).returning();
  res.status(201).json({
    ...site,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  });
});

router.delete("/contacts/:id/sites/:siteId", async (req, res): Promise<void> => {
  const contactId = Number(req.params.id);
  const siteId = Number(req.params.siteId);
  if (!Number.isSafeInteger(contactId) || !Number.isSafeInteger(siteId)) {
    res.status(400).json({ error: "Invalid site id" });
    return;
  }
  const companyId = await currentCompanyId();
  await db.delete(contactSitesTable).where(
    and(
      eq(contactSitesTable.id, siteId),
      eq(contactSitesTable.contactId, contactId),
      eq(contactSitesTable.companyId, companyId),
    ),
  );
  res.status(204).end();
});

router.patch("/contacts/:id", async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(contactsTable)
    .set(parsed.data)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.companyId, await currentCompanyId())))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichContact(row);
  res.json(UpdateContactResponse.parse(enriched));
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = await currentCompanyId();
  await db
    .delete(contactsTable)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.companyId, companyId)));
  res.status(204).end();
});

export default router;

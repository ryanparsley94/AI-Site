import { Router } from "express";
import { requireSingleCompanyPilot } from "../lib/single-company-pilot";
import { crmCsvDocument } from "../lib/crm-csv";
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

router.use(requireSingleCompanyPilot);

const MAX_EXPORT_ROWS = 10_000;

router.get("/contacts/export/:kind", async (req, res, next): Promise<void> => {
  const kind = req.params.kind;
  if (kind !== "customers.csv" && kind !== "sites.csv") {
    res.status(404).json({ error: "Export not found." });
    return;
  }
  try {
    const companyId = res.locals.pilotCompanyId as number;
    let headers: string[];
    let rows: unknown[][];
    if (kind === "customers.csv") {
      const data = await pool.query<{
        name: string; phone: string; email: string | null;
        address: string | null; type: string; notes: string | null;
      }>(
        `SELECT name,phone,email,address,type,notes
           FROM contacts WHERE company_id=$1 ORDER BY id LIMIT $2`,
        [companyId, MAX_EXPORT_ROWS + 1],
      );
      if (data.rows.length > MAX_EXPORT_ROWS) {
        res.status(413).json({ error: "More than 10,000 customers; request an assisted export." });
        return;
      }
      headers = ["Customer Name", "Phone Number", "Email Address", "Address", "Customer Type", "Notes"];
      rows = data.rows.map((c) => [c.name, c.phone, c.email, c.address, c.type, c.notes]);
    } else {
      const data = await pool.query<{
        customer_name: string; site_name: string; phone: string | null;
        address_street: string | null; city: string | null; region: string | null;
        postcode: string | null; country: string | null; notes: string | null;
      }>(
        `SELECT c.name AS customer_name, s.name AS site_name, s.phone,
                s.address_street,s.city,s.region,s.postcode,s.country,s.notes
           FROM contact_sites s
           JOIN contacts c ON c.id=s.contact_id AND c.company_id=s.company_id
          WHERE s.company_id=$1 ORDER BY s.id LIMIT $2`,
        [companyId, MAX_EXPORT_ROWS + 1],
      );
      if (data.rows.length > MAX_EXPORT_ROWS) {
        res.status(413).json({ error: "More than 10,000 sites; request an assisted export." });
        return;
      }
      headers = ["Customer", "Site Name", "Phone Number", "Physical Address Street",
        "Physical Address City", "Physical Address Region", "Physical Address Postal Code",
        "Physical Address Country", "Notes"];
      rows = data.rows.map((c) => [c.customer_name, c.site_name, c.phone,
        c.address_street, c.city, c.region, c.postcode, c.country, c.notes]);
    }

    const filename = kind === "customers.csv" ? "crewon-customers.csv" : "crewon-sites.csv";
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.type("text/csv; charset=utf-8");
    res.send(crmCsvDocument(headers, rows));
  } catch (error) {
    next(error);
  }
});

async function enrichContact(c: typeof contactsTable.$inferSelect) {
  if (c.companyId === null) throw new Error("Contact does not belong to a business.");
  const [jobs, emailThreads] = await Promise.all([
    db.select().from(jobsTable).where(and(eq(jobsTable.contactId, c.id), eq(jobsTable.companyId, c.companyId))),
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
  const companyId = res.locals.pilotCompanyId as number;
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
  const companyId = res.locals.pilotCompanyId as number;
  const [row] = await db.insert(contactsTable).values({ ...parsed.data, companyId }).returning();
  const enriched = await enrichContact(row);
  res.status(201).json(CreateContactResponse.parse(enriched));
});

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = res.locals.pilotCompanyId as number;
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
  const companyId = res.locals.pilotCompanyId as number;
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
  const companyId = res.locals.pilotCompanyId as number;
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
  const companyId = res.locals.pilotCompanyId as number;
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
    .set({ ...parsed.data, companyId: res.locals.pilotCompanyId as number })
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.companyId, res.locals.pilotCompanyId as number)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichContact(row);
  res.json(UpdateContactResponse.parse(enriched));
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = res.locals.pilotCompanyId as number;
  await db
    .delete(contactsTable)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.companyId, companyId)));
  res.status(204).end();
});

export default router;

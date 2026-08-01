import { Router } from "express";
import { db, companiesTable } from "@workspace/db";
import { GetCompanyResponse, UpdateCompanyBody, UpdateCompanyResponse } from "@workspace/api-zod";

const router = Router();

// Seed a default company if none exists
async function getOrCreateCompany() {
  const existing = await db.select().from(companiesTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db
    .insert(companiesTable)
    .values({
      name: "Apex Construction Co.",
      phone: "(555) 800-1234",
      email: "dispatch@apexconstruction.com",
      website: "https://apexconstruction.com",
      address: "482 Industrial Blvd, Austin, TX 78701",
      timezone: "America/Chicago",
    })
    .returning();
  return created;
}

router.get("/company", async (req, res): Promise<void> => {
  const company = await getOrCreateCompany();
  res.json(GetCompanyResponse.parse({
    ...company,
    createdAt: company.createdAt.toISOString(),
  }));
});

router.patch("/company", async (req, res): Promise<void> => {
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const company = await getOrCreateCompany();
  const { eq } = await import("drizzle-orm");
  const [updated] = await db
    .update(companiesTable)
    .set(parsed.data)
    .where(eq(companiesTable.id, company.id))
    .returning();
  res.json(UpdateCompanyResponse.parse({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
  }));
});

export default router;

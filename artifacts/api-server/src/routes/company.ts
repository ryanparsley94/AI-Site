import { Router } from "express";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, companiesTable } from "@workspace/db";
import {
  GetCompanyResponse,
  UpdateCompanyBody,
  UpdateCompanyResponse,
  GetWidgetKeyResponse,
  RegenerateWidgetKeyResponse,
  UpdateWidgetSettingsBody,
  UpdateWidgetSettingsResponse,
} from "@workspace/api-zod";
// adminOnly is applied at the router level in routes/index.ts

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

function mapWidgetKey(company: typeof companiesTable.$inferSelect) {
  return {
    widgetKey: company.widgetKey ?? null,
    color: company.widgetColor ?? "#f97316",
    greeting: company.widgetGreeting ?? "Hi! How can I help you today?",
  };
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

// ─── Widget key management ────────────────────────────────────────────────────

router.get("/company/widget-key", async (req, res): Promise<void> => {
  const company = await getOrCreateCompany();
  res.json(GetWidgetKeyResponse.parse(mapWidgetKey(company)));
});

router.post("/company/widget-key", async (req, res): Promise<void> => {
  const company = await getOrCreateCompany();
  const newKey = randomBytes(24).toString("hex");
  const [updated] = await db
    .update(companiesTable)
    .set({ widgetKey: newKey })
    .where(eq(companiesTable.id, company.id))
    .returning();
  res.json(RegenerateWidgetKeyResponse.parse(mapWidgetKey(updated)));
});

router.patch("/company/widget-settings", async (req, res): Promise<void> => {
  const parsed = UpdateWidgetSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const company = await getOrCreateCompany();
  const updateData: Partial<typeof companiesTable.$inferInsert> = {};
  if (parsed.data.color !== undefined) updateData.widgetColor = parsed.data.color;
  if (parsed.data.greeting !== undefined) updateData.widgetGreeting = parsed.data.greeting;
  const [updated] = await db
    .update(companiesTable)
    .set(updateData)
    .where(eq(companiesTable.id, company.id))
    .returning();
  res.json(UpdateWidgetSettingsResponse.parse(mapWidgetKey(updated)));
});

export default router;

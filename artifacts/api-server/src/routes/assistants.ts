import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, assistantsTable } from "@workspace/db";
import {
  ListAssistantsResponse,
  CreateAssistantBody,
  CreateAssistantResponse,
  GetAssistantParams,
  GetAssistantResponse,
  UpdateAssistantParams,
  UpdateAssistantBody,
  UpdateAssistantResponse,
  DeleteAssistantParams,
} from "@workspace/api-zod";

const router = Router();

function mapAssistant(a: typeof assistantsTable.$inferSelect) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/assistants", async (req, res): Promise<void> => {
  const rows = await db.select().from(assistantsTable).orderBy(assistantsTable.createdAt);
  res.json(ListAssistantsResponse.parse(rows.map(mapAssistant)));
});

router.post("/assistants", async (req, res): Promise<void> => {
  const parsed = CreateAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(assistantsTable).values(parsed.data).returning();
  res.status(201).json(CreateAssistantResponse.parse(mapAssistant(row)));
});

router.get("/assistants/:id", async (req, res): Promise<void> => {
  const params = GetAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(assistantsTable).where(eq(assistantsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetAssistantResponse.parse(mapAssistant(row)));
});

router.patch("/assistants/:id", async (req, res): Promise<void> => {
  const params = UpdateAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAssistantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(assistantsTable)
    .set(parsed.data)
    .where(eq(assistantsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateAssistantResponse.parse(mapAssistant(row)));
});

router.delete("/assistants/:id", async (req, res): Promise<void> => {
  const params = DeleteAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(assistantsTable).where(eq(assistantsTable.id, params.data.id));
  res.status(204).end();
});

export default router;

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, assistantsTable } from "@workspace/db";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
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

// Voice preview — returns audio/wav for the given voice
router.post("/assistants/voice-preview", async (req, res): Promise<void> => {
  const { voice, text } = req.body as { voice?: string; text?: string };
  const allowed = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  if (!voice || !allowed.includes(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }
  const sample = (text || "Hi, thanks for calling. How can I help you today?").slice(0, 200);
  const buf = await textToSpeech(
    sample,
    voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
    "mp3"
  );
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", buf.length);
  res.send(buf);
});

export default router;

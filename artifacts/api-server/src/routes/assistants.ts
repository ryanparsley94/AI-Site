import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, pool, assistantsTable, assistantTrainingTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
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
  ListAssistantTrainingParams,
  CreateAssistantTrainingParams,
  CreateAssistantTrainingBody,
  CreateAssistantTrainingResponse,
  UpdateAssistantTrainingParams,
  UpdateAssistantTrainingBody,
  UpdateAssistantTrainingResponse,
  DeleteAssistantTrainingParams,
  ListAssistantTrainingResponse,
  TestAssistantParams,
  TestAssistantBody,
  TestAssistantResponse,
} from "@workspace/api-zod";

const router = Router();

async function currentCompanyId(): Promise<number> {
  const company = await pool.query<{ id: number }>(
    "SELECT id FROM companies ORDER BY id LIMIT 1",
  );
  if (!company.rows[0]) throw new Error("Business profile is not configured.");
  return company.rows[0].id;
}

function mapAssistant(a: typeof assistantsTable.$inferSelect) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
  };
}

function mapTraining(t: typeof assistantTrainingTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/assistants", async (_req, res): Promise<void> => {
  const companyId = await currentCompanyId();
  const rows = await db
    .select()
    .from(assistantsTable)
    .where(eq(assistantsTable.companyId, companyId))
    .orderBy(assistantsTable.createdAt);
  res.json(ListAssistantsResponse.parse(rows.map(mapAssistant)));
});

router.post("/assistants", async (req, res): Promise<void> => {
  const parsed = CreateAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const companyId = await currentCompanyId();
  const [row] = await db
    .insert(assistantsTable)
    .values({ ...parsed.data, companyId })
    .returning();
  res.status(201).json(CreateAssistantResponse.parse(mapAssistant(row)));
});

router.get("/assistants/:id", async (req, res): Promise<void> => {
  const params = GetAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = await currentCompanyId();
  const [row] = await db
    .select()
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
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
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, await currentCompanyId())))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateAssistantResponse.parse(mapAssistant(row)));
});

router.delete("/assistants/:id", async (req, res): Promise<void> => {
  const params = DeleteAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = await currentCompanyId();
  await db
    .delete(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  res.status(204).end();
});

// Voice preview — returns audio/wav for the given voice
router.post("/assistants/voice-preview", async (req, res): Promise<void> => {
  const { voice, text } = req.body as { voice?: string; text?: string };
  const allowed = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
  if (!voice || !allowed.includes(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "OpenAI voice previews are not configured yet." });
    return;
  }

  const sample = (text || "Hi, thanks for calling. How can I help you today?").slice(0, 200);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: sample,
        instructions: "Speak in natural British English. Warm, professional, conversational, concise and not salesy.",
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      res.status(502).json({ error: "Voice preview provider returned an error." });
      return;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch {
    res.status(502).json({ error: "Voice preview is temporarily unavailable." });
  }
});

// ─── Training CRUD ────────────────────────────────────────────────────────────

router.get("/assistants/:id/training", async (req, res): Promise<void> => {
  const params = ListAssistantTrainingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const companyId = await currentCompanyId();
  const [owned] = await db
    .select({ id: assistantsTable.id })
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!owned) { res.status(404).json({ error: "Assistant not found" }); return; }
  const rows = await db
    .select()
    .from(assistantTrainingTable)
    .where(eq(assistantTrainingTable.assistantId, params.data.id))
    .orderBy(assistantTrainingTable.createdAt);
  res.json(ListAssistantTrainingResponse.parse(rows.map(mapTraining)));
});

router.post("/assistants/:id/training", async (req, res): Promise<void> => {
  const params = CreateAssistantTrainingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  // Verify the assistant belongs to this business.
  const companyId = await currentCompanyId();
  const [assistant] = await db
    .select()
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!assistant) { res.status(404).json({ error: "Assistant not found" }); return; }

  const parsed = CreateAssistantTrainingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .insert(assistantTrainingTable)
    .values({ assistantId: params.data.id, ...parsed.data })
    .returning();
  res.status(201).json(CreateAssistantTrainingResponse.parse(mapTraining(row)));
});

router.patch("/assistants/:id/training/:trainingId", async (req, res): Promise<void> => {
  const params = UpdateAssistantTrainingParams.safeParse({
    id: Number(req.params.id),
    trainingId: Number(req.params.trainingId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const parsed = UpdateAssistantTrainingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await currentCompanyId();
  const [owned] = await db
    .select({ id: assistantsTable.id })
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!owned) { res.status(404).json({ error: "Assistant not found" }); return; }

  const [row] = await db
    .update(assistantTrainingTable)
    .set(parsed.data)
    .where(
      and(
        eq(assistantTrainingTable.id, params.data.trainingId),
        eq(assistantTrainingTable.assistantId, params.data.id)
      )
    )
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateAssistantTrainingResponse.parse(mapTraining(row)));
});

router.delete("/assistants/:id/training/:trainingId", async (req, res): Promise<void> => {
  const params = DeleteAssistantTrainingParams.safeParse({
    id: Number(req.params.id),
    trainingId: Number(req.params.trainingId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const companyId = await currentCompanyId();
  const [owned] = await db
    .select({ id: assistantsTable.id })
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!owned) { res.status(404).json({ error: "Assistant not found" }); return; }
  await db
    .delete(assistantTrainingTable)
    .where(
      and(
        eq(assistantTrainingTable.id, params.data.trainingId),
        eq(assistantTrainingTable.assistantId, params.data.id)
      )
    );
  res.status(204).end();
});

// ─── Build system prompt with training context ────────────────────────────────

function buildSystemPrompt(
  assistant: typeof assistantsTable.$inferSelect,
  trainingEntries: typeof assistantTrainingTable.$inferSelect[]
): string {
  const parts: string[] = [];

  parts.push(
    `You are ${assistant.name}, the AI receptionist for a UK trade business. ` +
    `Your personality is ${assistant.personality}. ` +
    (assistant.instructions ? assistant.instructions : "")
  );

  if (trainingEntries.length > 0) {
    const grouped: Record<string, typeof trainingEntries> = {};
    for (const entry of trainingEntries) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }

    const categoryLabels: Record<string, string> = {
      service: "Services Offered",
      faq: "Frequently Asked Questions",
      area: "Service Area",
      hours: "Business Hours",
      upsell: "Upsells & Add-ons",
    };

    parts.push("\n\n## Business Knowledge\n");
    for (const [cat, entries] of Object.entries(grouped)) {
      parts.push(`### ${categoryLabels[cat] ?? cat}`);
      for (const e of entries) {
        parts.push(`Q: ${e.question}\nA: ${e.answer}`);
      }
    }
  }

  return parts.join("\n");
}

// ─── Test the assistant ───────────────────────────────────────────────────────

router.post("/assistants/:id/test", async (req, res): Promise<void> => {
  const params = TestAssistantParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TestAssistantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await currentCompanyId();
  const [assistant] = await db
    .select()
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!assistant) { res.status(404).json({ error: "Assistant not found" }); return; }

  const trainingEntries = await db
    .select()
    .from(assistantTrainingTable)
    .where(eq(assistantTrainingTable.assistantId, params.data.id))
    .orderBy(assistantTrainingTable.createdAt);

  const systemPrompt = buildSystemPrompt(assistant, trainingEntries);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: parsed.data.question },
    ],
  });

  const answer = completion.choices[0]?.message?.content ?? "I'm unable to answer that right now.";
  res.json(TestAssistantResponse.parse({ answer }));
});

export default router;

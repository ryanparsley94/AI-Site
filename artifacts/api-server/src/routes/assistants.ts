import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, pool, assistantsTable, assistantTrainingTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getReceptionistVoicePersona, RECEPTIONIST_VOICE_PERSONAS } from "@workspace/api-zod";
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
  const voice = parsed.data.type === "phone" ? (parsed.data.realtimeVoice ?? "cedar") : parsed.data.voice;
  const [row] = await db
    .insert(assistantsTable)
    .values({ ...parsed.data, voice, companyId })
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
  const companyId = await currentCompanyId();
  const [owned] = await db
    .select({ id: assistantsTable.id, type: assistantsTable.type, realtimeVoice: assistantsTable.realtimeVoice })
    .from(assistantsTable)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)));
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  const updateData = { ...parsed.data };
  if (owned.type === "phone" || parsed.data.type === "phone") {
    const realtimeVoice = (parsed.data.realtimeVoice ?? owned.realtimeVoice ?? "cedar") as NonNullable<typeof parsed.data.realtimeVoice>;
    updateData.realtimeVoice = realtimeVoice;
    updateData.voice = realtimeVoice;
  }
  const [row] = await db
    .update(assistantsTable)
    .set(updateData)
    .where(and(eq(assistantsTable.id, params.data.id), eq(assistantsTable.companyId, companyId)))
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

// Voice preview — a supplied voice is preview-only and never changes the saved assistant.
router.post("/assistants/voice-preview", async (req, res): Promise<void> => {
  const { text } = req.body as { assistantId?: number; voice?: string; text?: string };
  const allowed = new Set<string>(RECEPTIONIST_VOICE_PERSONAS.map((persona) => persona.id));
  let voice = req.body?.voice as string | undefined;
  let personaDirection: string | undefined;
  if (req.body?.assistantId !== undefined) {
    const assistantId = Number(req.body.assistantId);
    if (!Number.isSafeInteger(assistantId) || assistantId < 1) { res.status(400).json({ error: "Invalid assistant id." }); return; }
    const companyId = await currentCompanyId();
    const saved = await pool.query<{ realtime_voice: string }>(
      "SELECT realtime_voice FROM assistants WHERE id=$1 AND company_id=$2 AND type='phone' LIMIT 1",
      [assistantId, companyId],
    );
    if (!saved.rows[0]) { res.status(404).json({ error: "Phone assistant not found." }); return; }
    voice = voice ?? saved.rows[0].realtime_voice;
    if (!allowed.has(voice)) { res.status(400).json({ error: "Invalid voice" }); return; }
    const persona = RECEPTIONIST_VOICE_PERSONAS.find((item) => item.id === voice);
    if (!persona) { res.status(409).json({ error: "Save a supported receptionist voice before previewing." }); return; }
    personaDirection = persona.direction;
  }
  if (!voice || !allowed.has(voice)) {
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
        instructions: `Speak in natural British English. ${personaDirection ? `Use this subtle style cue where supported: ${personaDirection}. Do not claim an exact regional accent.` : ""} Warm, professional, conversational, concise and not salesy.`,
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
    model: process.env.OPENAI_ASSISTANT_TEST_MODEL || process.env.OPENAI_POSTCALL_MODEL || "gpt-4o-mini",
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

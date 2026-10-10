import { Router } from "express";
import WebSocket from "ws";
import { eq, and } from "drizzle-orm";
import { db, assistantsTable, assistantTrainingTable } from "@workspace/db";
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

router.get("/assistants", async (req, res): Promise<void> => {
  const rows = await db.select().from(assistantsTable).orderBy(assistantsTable.createdAt);
  res.json(ListAssistantsResponse.parse(rows.map(mapAssistant)));
});

router.get("/assistants/realtime-status", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    openAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    twilioAuthToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
    voicePublicBaseUrl: Boolean(process.env.VOICE_PUBLIC_BASE_URL),
  });
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
function pcmuToWav(encoded: Buffer): Buffer {
  const samples = Buffer.alloc(encoded.length * 2);
  for (let i = 0; i < encoded.length; i++) {
    const value = (~encoded[i]!) & 0xff;
    const sign = value & 0x80;
    const exponent = (value >> 4) & 0x07;
    const mantissa = value & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    samples.writeInt16LE(sign ? -sample : sample, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

router.post("/assistants/voice-preview", async (req, res): Promise<void> => {
  const { voice, text } = req.body as { voice?: string; text?: string };
  const allowed = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
  if (!voice || !allowed.includes(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Add OPENAI_API_KEY in Replit Secrets to preview Realtime voices." });
    return;
  }
  const sample = (text || "Hi, thanks for calling. How can I help you today?").slice(0, 200);
  try {
    const socket = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      handshakeTimeout: 8000,
    });
    const audio = await new Promise<Buffer>((resolve, reject) => {
      let configured = false;
      let settled = false;
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        socket.terminate();
        fail(new Error("Realtime preview timed out"));
      }, 15000);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.terminate();
        reject(error);
      };
      socket.on("open", () => socket.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: `Read this exact sentence aloud, in a natural clear British English voice. Do not add words: ${sample}`,
          output_modalities: ["audio"],
          audio: { output: { format: { type: "audio/pcmu" }, voice } },
        },
      })));
      socket.on("message", raw => {
        let event: Record<string, any>;
        try { event = JSON.parse(raw.toString()); } catch { return; }
        if (event.type === "session.updated" && !configured) {
          configured = true;
          socket.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "message", role: "user", content: [{ type: "input_text", text: `Say: ${sample}` }] },
          }));
          socket.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
        } else if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
          chunks.push(Buffer.from(event.delta, "base64"));
        } else if (event.type === "response.done") {
          if (settled) return;
          if (!chunks.length) { fail(new Error("Realtime preview returned no audio")); return; }
          settled = true;
          clearTimeout(timeout);
          socket.close();
          resolve(pcmuToWav(Buffer.concat(chunks)));
        } else if (event.type === "error") {
          fail(new Error("OpenAI could not create this voice preview"));
        }
      });
      socket.on("error", error => fail(error));
      socket.on("close", () => {
        if (!settled) fail(new Error("Realtime preview ended before audio was ready"));
      });
    });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch {
    res.status(502).json({ error: "OpenAI Realtime voice preview is unavailable." });
  }
});

// ─── Training CRUD ────────────────────────────────────────────────────────────

router.get("/assistants/:id/training", async (req, res): Promise<void> => {
  const params = ListAssistantTrainingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
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

  // Verify assistant exists
  const [assistant] = await db.select().from(assistantsTable).where(eq(assistantsTable.id, params.data.id));
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
    `You are ${assistant.name}, an AI phone assistant for a construction company. ` +
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

  const [assistant] = await db.select().from(assistantsTable).where(eq(assistantsTable.id, params.data.id));
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

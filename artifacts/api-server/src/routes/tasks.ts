import { Router } from "express";
import { eq, desc, gte, lte, and, ne } from "drizzle-orm";
import { db, tasksTable, callsTable, emailThreadsTable, jobsTable } from "@workspace/db";
import {
  ListTasksResponse,
  CreateTaskBody,
  CreateTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
  GenerateTasksResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AiSuggestion {
  title: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
}

/** Validate and normalise a single AI-generated task suggestion. Returns null if invalid. */
function parseAiSuggestion(raw: unknown): AiSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r["title"] === "string" ? r["title"].trim() : "";
  if (!title || title.length > 500) return null;
  const priority = VALID_PRIORITIES.has(r["priority"] as string)
    ? (r["priority"] as "high" | "medium" | "low")
    : "medium";
  const rawDate = r["dueDate"] ?? r["due_date"];
  const dueDate =
    typeof rawDate === "string" && DATE_RE.test(rawDate) ? rawDate : null;
  return { title, priority, dueDate };
}

function parseAiSuggestions(raw: unknown): AiSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseAiSuggestion).filter((s): s is AiSuggestion => s !== null);
}

const router = Router();

function mapTask(t: typeof tasksTable.$inferSelect) {
  return {
    ...t,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(tasksTable)
    .orderBy(desc(tasksTable.createdAt));
  res.json(ListTasksResponse.parse(rows.map(mapTask)));
});

router.post("/tasks/generate", async (req, res): Promise<void> => {
  // Fetch recent context: last 10 calls, last 5 email threads, next 7 days of jobs
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [recentCalls, recentEmails, upcomingJobs, existingTasks] = await Promise.all([
    db.select().from(callsTable).orderBy(desc(callsTable.createdAt)).limit(10),
    db.select().from(emailThreadsTable).orderBy(desc(emailThreadsTable.createdAt)).limit(5),
    db
      .select()
      .from(jobsTable)
      .where(
        and(
          gte(jobsTable.scheduledAt, now),
          lte(jobsTable.scheduledAt, inSevenDays)
        )
      )
      .orderBy(jobsTable.scheduledAt)
      .limit(10),
    // Fetch existing pending tasks to avoid duplicate insertions
    db.select({ title: tasksTable.title }).from(tasksTable).where(ne(tasksTable.status, "dismissed")),
  ]);

  const existingTitlesLower = new Set(existingTasks.map((t) => t.title.toLowerCase()));

  const callsSummary = recentCalls
    .map(
      (c) =>
        `- Call from ${c.callerName} (${c.callerPhone}): outcome="${c.outcome || "none"}", status=${c.status}, notes="${c.notes || "none"}"`
    )
    .join("\n") || "No recent calls.";

  const emailsSummary = recentEmails
    .map(
      (e) =>
        `- Email from ${e.fromName} <${e.fromEmail}>, subject="${e.subject}", status=${e.status}`
    )
    .join("\n") || "No recent emails.";

  const jobsSummary = upcomingJobs
    .map(
      (j) =>
        `- Job: "${j.title}" for ${j.contactName}, scheduled ${j.scheduledAt.toISOString().slice(0, 10)}, status=${j.status}`
    )
    .join("\n") || "No upcoming jobs.";

  const today = new Date().toISOString().slice(0, 10);

  const existingTasksSummary = existingTasks.length > 0
    ? existingTasks.map((t) => `- ${t.title}`).join("\n")
    : "None";

  const systemPrompt = `You are a smart AI assistant for a construction/trades contractor.
Today's date is ${today}.
Your job is to analyse the contractor's recent calls, emails, and upcoming jobs, then produce a concise prioritised to-do list for today.

Rules:
- Return ONLY a JSON array — no markdown fences, no extra text.
- Each item: { "title": "...", "priority": "high"|"medium"|"low", "dueDate": "YYYY-MM-DD or null" }
- Generate between 3 and 8 tasks.
- Prioritise: unresolved calls > pending emails > upcoming jobs needing confirmation > follow-ups.
- Be specific (include client names, job details) and action-oriented ("Call back John Smith re plumbing quote").
- Do NOT generate tasks that overlap with or duplicate the existing tasks listed below.

Existing tasks already on the list (do not duplicate):
${existingTasksSummary}`;

  const userPrompt = `Recent calls:\n${callsSummary}\n\nRecent emails:\n${emailsSummary}\n\nUpcoming jobs:\n${jobsSummary}`;

  let suggestions: Array<{ title: string; priority: "high" | "medium" | "low"; dueDate: string | null }> = [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    suggestions = parseAiSuggestions(JSON.parse(raw));
  } catch {
    // Fall back to a sensible default if AI fails or returns malformed output
    suggestions = [];
  }

  // If AI returned nothing useful, use safe defaults
  if (suggestions.length === 0) {
    suggestions = [
      { title: "Review recent calls and follow up with outstanding clients", priority: "high", dueDate: today },
      { title: "Check pending emails and send replies", priority: "medium", dueDate: today },
      { title: "Confirm upcoming job schedules with clients", priority: "medium", dueDate: today },
    ];
  }

  // Deduplicate: skip suggestions whose title closely matches an existing task
  const deduped = suggestions.filter(
    (s) => !existingTitlesLower.has(s.title.toLowerCase())
  );

  // Insert deduplicated AI-generated tasks into the DB
  const inserted: (typeof tasksTable.$inferSelect)[] = [];
  for (const s of deduped) {
    const [row] = await db
      .insert(tasksTable)
      .values({
        title: s.title,
        priority: s.priority ?? "medium",
        status: "pending",
        source: "ai",
        dueDate: s.dueDate ? new Date(s.dueDate) : null,
      })
      .returning();
    inserted.push(row);
  }

  res.status(201).json(GenerateTasksResponse.parse(inserted.map(mapTask)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { dueDate, ...rest } = parsed.data;
  const [row] = await db
    .insert(tasksTable)
    .values({
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
    })
    .returning();
  res.status(201).json(CreateTaskResponse.parse(mapTask(row)));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { dueDate, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (dueDate !== undefined) {
    updateData.dueDate = dueDate ? new Date(dueDate) : null;
  }
  const [row] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(UpdateTaskResponse.parse(mapTask(row)));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  res.status(204).end();
});

export default router;

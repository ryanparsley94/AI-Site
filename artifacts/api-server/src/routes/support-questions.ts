import { Router } from "express";

const router = Router();

/**
 * Public endpoint — no session required.
 * Accepts a support question submission from the landing page FAQ.
 */
router.post("/support-questions", async (req, res): Promise<void> => {
  const { name, question } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0 || name.length > 200) {
    res.status(400).json({ error: "name must be a non-empty string (max 200 chars)" });
    return;
  }
  if (typeof question !== "string" || question.trim().length === 0 || question.length > 2000) {
    res.status(400).json({ error: "question must be a non-empty string (max 2000 chars)" });
    return;
  }

  // Log for now — a future task can route these to email or a DB table
  console.log("[support-question]", { name: name.trim(), question: question.trim(), at: new Date().toISOString() });

  res.status(201).json({ ok: true, message: "Thank you — we'll be in touch soon." });
});

export default router;

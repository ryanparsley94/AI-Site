import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, certificatesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ListCertificatesResponse,
  CreateCertificateBody,
  CreateCertificateResponse,
  GetCertificateParams,
  GetCertificateResponse,
  UpdateCertificateParams,
  UpdateCertificateBody,
  UpdateCertificateResponse,
  DeleteCertificateParams,
  GenerateCertificateBody,
  GenerateCertificateResponse,
} from "@workspace/api-zod";

const router = Router();

const CERT_LABELS: Record<string, string> = {
  completion: "Project Completion Certificate",
  safety: "Safety Compliance Certificate",
  warranty: "Warranty Certificate",
  lien_waiver: "Lien Waiver",
  subcontractor_agreement: "Subcontractor Agreement",
};

const CERT_PROMPTS: Record<string, string> = {
  completion: `Generate a formal Project Completion Certificate for a construction company. The document should confirm that all contracted work has been completed satisfactorily, reference the project details, include a sign-off section, and use professional legal language appropriate for construction industry documents.`,
  safety: `Generate a Safety Compliance Certificate for a construction project. The document should certify that all work was performed in compliance with relevant safety standards and regulations (OSHA), list the key safety measures observed, and be signed off by the company representative.`,
  warranty: `Generate a Warranty Certificate for completed construction work. The document should clearly state the warranty period (typically 1-2 years), what is covered (workmanship and materials), what is excluded, and provide contact information for warranty claims.`,
  lien_waiver: `Generate a Lien Waiver document for a construction project. The document should be a Conditional Waiver and Release Upon Final Payment, releasing all lien rights upon receipt of final payment, and comply with standard construction lien waiver practices. Include all required legal clauses.`,
  subcontractor_agreement: `Generate a Subcontractor Agreement for a construction project. The document should cover scope of work, payment terms, insurance requirements, compliance with laws and regulations, indemnification, termination clauses, and dispute resolution. Use professional legal language.`,
};

function buildPrompt(type: string, context: {
  jobTitle?: string | null;
  jobDescription?: string | null;
  jobAddress?: string | null;
  contactName?: string | null;
  completionDate?: string | null;
  customInstructions?: string | null;
  companyName?: string;
}): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const basePrompt = CERT_PROMPTS[type] ?? CERT_PROMPTS.completion;

  return `${basePrompt}

Company Information:
- Company Name: ${context.companyName ?? "The Company"}
- Document Date: ${context.completionDate ?? today}

Project Details:
- Project/Job Title: ${context.jobTitle ?? "Construction Project"}
- Project Description: ${context.jobDescription ?? "General construction services"}
- Project Address: ${context.jobAddress ?? "[Project Address]"}
- Client/Contact Name: ${context.contactName ?? "[Client Name]"}

${context.customInstructions ? `Additional Instructions: ${context.customInstructions}` : ""}

Format the document professionally with:
- A clear document title at the top
- Date and reference number
- Clearly labeled sections with headings
- A signature block at the bottom with lines for authorized signatures
- Professional, formal language throughout

Return only the document text — no commentary, no markdown code blocks, just the formatted document content.`;
}

function mapCert(c: typeof certificatesTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
  };
}

// Generate endpoint — must be before /:id to avoid route collision
router.post("/certificates/generate", async (req, res): Promise<void> => {
  const parsed = GenerateCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, ...context } = parsed.data;

  // Fetch company name from DB for context
  let companyName = "Your Construction Company";
  try {
    const { companiesTable } = await import("@workspace/db");
    const companies = await db.select().from(companiesTable).limit(1);
    if (companies[0]) companyName = companies[0].name;
  } catch {}

  const prompt = buildPrompt(type, { ...context, companyName });

  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const title = `${CERT_LABELS[type] ?? "Certificate"} — ${context.jobTitle ?? new Date().toLocaleDateString()}`;

  res.json(GenerateCertificateResponse.parse({ title, content }));
});

router.get("/certificates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(certificatesTable).orderBy(desc(certificatesTable.createdAt));
  res.json(ListCertificatesResponse.parse(rows.map(mapCert)));
});

router.post("/certificates", async (req, res): Promise<void> => {
  const parsed = CreateCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(certificatesTable).values(parsed.data).returning();
  res.status(201).json(CreateCertificateResponse.parse(mapCert(row)));
});

router.get("/certificates/:id", async (req, res): Promise<void> => {
  const params = GetCertificateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(certificatesTable).where(eq(certificatesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetCertificateResponse.parse(mapCert(row)));
});

router.patch("/certificates/:id", async (req, res): Promise<void> => {
  const params = UpdateCertificateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateCertificateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(certificatesTable).set(parsed.data).where(eq(certificatesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateCertificateResponse.parse(mapCert(row)));
});

router.delete("/certificates/:id", async (req, res): Promise<void> => {
  const params = DeleteCertificateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(certificatesTable).where(eq(certificatesTable.id, params.data.id));
  res.status(204).end();
});

export default router;

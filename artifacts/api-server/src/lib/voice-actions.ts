import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { QuoteWorkflow } from "@workspace/api-zod";

export const materialSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive().max(100000),
  unit: z.string().trim().min(1).max(40),
});
export const intentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("none"), message: z.string().min(1).max(800) }),
  z.object({ action: z.literal("complete_job"), job: z.string().min(1) }),
  z.object({ action: z.literal("send_invoice"), job: z.string().min(1) }),
  z.object({
    action: z.literal("create_job"), title: z.string().min(1).max(200),
    contactName: z.string().min(1).max(200), contactPhone: z.string().min(1).max(40),
    serviceType: z.string().min(1).max(100), address: z.string().min(1).max(500),
    scheduledAt: z.string().datetime({ offset: true }),
  }),
  z.object({ action: z.literal("add_quote_items"), quote: z.string().min(1), items: z.array(materialSchema).min(1).max(100) }),
  z.object({ action: z.literal("schedule") }),
  z.object({ action: z.literal("outstanding_invoices") }),
  z.object({ action: z.literal("quote_draft"), items: z.array(materialSchema).min(1).max(100) }),
]);
export type VoiceIntent = z.infer<typeof intentSchema>;
type Job = { id: number; title: string; contactName: string; status: string; scheduledAt: Date };
type Quote = { id: number; title: string; materials: unknown; workflow?: unknown; revision?: number; status?: string };
type Invoice = { id: number; jobId: number | null; invoiceNumber: string; status: string; total: string; clientName: string | null };
export type VoiceData = { jobs: Job[]; quotes: Quote[]; invoices: Invoice[] };
export type ActionResult = {
  action: VoiceIntent["action"]; spokenResponse: string;
  quoteDraft?: z.infer<typeof materialSchema>[]; navigateTo?: string;
};
type CallApi = (path: string, method: string, body?: unknown) => Promise<unknown>;

// Never let a model choose the first fuzzy match. Names and IDs must resolve uniquely.
export function resolveNamed<T extends { id: number }>(rows: T[], query: string, names: (row: T) => string[]): T | undefined {
  const q = query.trim().toLocaleLowerCase("en-GB").replace(/^#/, "");
  const exact = rows.filter(row => String(row.id) === q || names(row).some(n => n.toLocaleLowerCase("en-GB") === q));
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const matches = rows.filter(row => names(row).some(n => n.toLocaleLowerCase("en-GB").includes(q)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function executeVoiceAction(
  intent: VoiceIntent, data: VoiceData, callApi: CallApi, timeZone: string, now = new Date(),
): Promise<ActionResult> {
  const none = (spokenResponse: string): ActionResult => ({ action: "none", spokenResponse });
  switch (intent.action) {
    case "none": return none(intent.message);
    case "quote_draft":
      return { action: intent.action, quoteDraft: intent.items, navigateTo: "/quotes", spokenResponse: `I've prepared ${intent.items.length} material rows in the quote builder. Please check the descriptions and quantities before pricing or saving.` };
    case "complete_job": {
      const job = resolveNamed(data.jobs, intent.job, j => [j.title, j.contactName]);
      if (!job) return none("I couldn't identify one job. Please repeat the command with the full job title or job number.");
      if (job.status === "completed") return none(`${job.title} is already complete.`);
      if (job.status === "cancelled") return none(`${job.title} is cancelled. Please review it in the job schedule.`);
      await callApi(`/jobs/${job.id}`, "PATCH", { status: "completed" });
      return { action: intent.action, spokenResponse: `${job.title} is now marked complete.`, navigateTo: "/jobs" };
    }
    case "create_job":
      if (new Date(intent.scheduledAt).getTime() <= now.getTime()) return none("Please give a future date and time for the visit.");
      await callApi("/jobs", "POST", {
        title: intent.title, contactName: intent.contactName, contactPhone: intent.contactPhone,
        serviceType: intent.serviceType, address: intent.address, scheduledAt: intent.scheduledAt, status: "scheduled",
      });
      return { action: intent.action, spokenResponse: `${intent.title} is scheduled for ${new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(intent.scheduledAt))}.`, navigateTo: "/jobs" };
    case "send_invoice": {
      const job = resolveNamed(data.jobs, intent.job, j => [j.title, j.contactName]);
      if (!job) return none("Please repeat the send command with the full job title or job number so I can identify one job.");
      const invoices = data.invoices.filter(i => i.jobId === job.id && i.status === "draft");
      if (invoices.length !== 1) return none(invoices.length ? "There are several draft invoices for that job. Please review them on the invoices page." : "That job has no unsent draft invoice. I haven't sent anything.");
      await callApi(`/invoices/${invoices[0].id}/send`, "POST");
      return { action: intent.action, spokenResponse: `${invoices[0].invoiceNumber} for ${job.title} has been emailed to the client.`, navigateTo: "/invoices" };
    }
    case "add_quote_items": {
      const quote = resolveNamed(data.quotes, intent.quote, q => [q.title]);
      if (!quote) return none("Please repeat the command with the full quote title or quote number.");
      if (quote.status === "accepted") return none("Accepted quotes are locked. Duplicate the quote for changes before adding materials.");
      if (quote.workflow) {
        const workflow = quote.workflow as QuoteWorkflow;
        const items = intent.items.map(i => ({
          id: randomUUID(), type: "materials" as const, description: i.name, quantity: i.quantity, unit: i.unit,
          costPrice: 0, sellPrice: 0,
        }));
        const sections = workflow.sections.map(s => ({ ...s, items: [...s.items] }));
        if (sections.length) sections[0].items.push(...items);
        else sections.push({ id: randomUUID(), title: "Work & materials", items });
        await callApi(`/quotes/${quote.id}`, "PATCH", { workflow: { ...workflow, sections }, revision: quote.revision });
        return { action: intent.action, spokenResponse: `I've added ${items.length} unpriced material rows to ${quote.title}. Review and price them before sending the quote.`, navigateTo: "/quotes" };
      }
      const materials = Array.isArray(quote.materials) ? quote.materials : [];
      // New items are deliberately unpriced, so totals remain unchanged until reviewed.
      await callApi(`/quotes/${quote.id}`, "PATCH", {
        materials: [...materials, ...intent.items.map(i => ({ ...i, unitPrice: null, total: null, source: null }))],
      });
      return { action: intent.action, spokenResponse: `I've added ${intent.items.length} unpriced material rows to ${quote.title}. Review and price them before sending the quote.`, navigateTo: "/quotes" };
    }
    case "schedule": {
      const today = data.jobs.filter(j => localDay(j.scheduledAt, timeZone) === localDay(now, timeZone) && !["cancelled", "completed"].includes(j.status));
      const details = today.slice(0, 12).map(j => `${new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(j.scheduledAt)}, ${j.title} for ${j.contactName}`).join("; ");
      return { action: intent.action, spokenResponse: today.length ? `You have ${today.length} active jobs today. ${details}${today.length > 12 ? ". See the schedule for the remaining jobs." : "."}` : "You have no active jobs scheduled today.", navigateTo: "/jobs" };
    }
    case "outstanding_invoices": {
      const outstanding = data.invoices.filter(i => i.status === "sent");
      const total = outstanding.reduce((sum, i) => sum + Number(i.total), 0);
      const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(total);
      return { action: intent.action, spokenResponse: `You have ${outstanding.length} sent, unpaid invoices totalling ${money}. There are also ${data.invoices.filter(i => i.status === "draft").length} unsent drafts.`, navigateTo: "/invoices" };
    }
  }
}

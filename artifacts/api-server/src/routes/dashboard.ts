import { Router } from "express";
import { eq, gte, and, lte } from "drizzle-orm";
import { db, pool, callsTable, jobsTable, assistantsTable, contactsTable, invoicesTable, companiesTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router = Router();

// Configuration and observed activity are separate: secrets alone do not prove
// that a real customer call or email was received and handled successfully.
router.get("/dashboard/pilot-readiness", async (_req, res): Promise<void> => {
  const [voice, email, companies] = await Promise.all([
    pool.query<{ completed: string; delivered: string }>(
      "SELECT count(*) FILTER (WHERE completed)::text AS completed, count(*) FILTER (WHERE notification_status='sent')::text AS delivered FROM voice_call_sessions"
    ),
    pool.query<{ received: string; replied: string }>(
      "SELECT count(*)::text AS received, count(*) FILTER (WHERE status='sent')::text AS replied FROM email_threads WHERE message_id IS NOT NULL"
    ),
    db.select().from(companiesTable).limit(1),
  ]);
  res.json({
    phoneConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN && process.env.VOICE_PUBLIC_BASE_URL && process.env.TWILIO_ACCOUNT_SID),
    emailInboundConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY),
    emailOutboundConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    ownerEmailConfigured: Boolean(companies[0]?.email),
    completedCalls: Number(voice.rows[0]?.completed ?? 0),
    ownerSummariesSent: Number(voice.rows[0]?.delivered ?? 0),
    inboundEmails: Number(email.rows[0]?.received ?? 0),
    emailRepliesSent: Number(email.rows[0]?.replied ?? 0),
  });
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [calls, jobs, assistants, contacts, invoices] = await Promise.all([
    db.select().from(callsTable),
    db.select().from(jobsTable),
    db.select().from(assistantsTable),
    db.select().from(contactsTable),
    db.select().from(invoicesTable),
  ]);

  const callsToday = calls.filter((c) => c.createdAt >= startOfDay).length;
  const missedCallsToday = calls.filter((c) => c.createdAt >= startOfDay && c.status === "missed").length;
  const bookedThisMonth = calls.filter((c) => c.createdAt >= startOfMonth && c.status === "booked").length;
  const totalThisMonth = calls.filter((c) => c.createdAt >= startOfMonth).length;
  const bookingRate = totalThisMonth > 0 ? Math.round((bookedThisMonth / totalThisMonth) * 100) / 100 : 0;

  const jobsThisWeek = jobs.filter((j) => j.scheduledAt >= startOfWeek && j.scheduledAt <= inSevenDays).length;
  const upcomingJobsCount = jobs.filter((j) => j.scheduledAt >= now && j.scheduledAt <= inSevenDays).length;

  const activeAssistants = assistants.filter((a) => a.active).length;
  const newLeadsThisWeek = contacts.filter((c) => c.createdAt >= startOfWeek && c.type === "lead").length;

  const revenueThisMonth = jobs
    .filter((j) => j.status === "completed" && j.scheduledAt >= startOfMonth && j.estimatedValue)
    .reduce((sum, j) => sum + Number(j.estimatedValue ?? 0), 0);

  // Invoice stats
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);

  const outstandingTotal = invoices
    .filter((inv) => inv.status === "draft" || inv.status === "sent")
    .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  const paidThisMonth = invoices
    .filter((inv) => inv.status === "paid" && inv.updatedAt >= startOfMonth)
    .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  const overdueCount = invoices.filter(
    (inv) => (inv.status === "draft" || inv.status === "sent") && inv.dueDate < todayStr
  ).length;

  res.json(GetDashboardSummaryResponse.parse({
    callsToday,
    jobsThisWeek,
    activeAssistants,
    newLeadsThisWeek,
    bookingRate,
    revenueThisMonth,
    upcomingJobsCount,
    missedCallsToday,
    invoiceStats: {
      outstandingTotal,
      paidThisMonth,
      overdueCount,
    },
  }));
});

export default router;

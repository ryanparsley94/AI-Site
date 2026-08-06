import { Router } from "express";
import { eq, gte, and, lte } from "drizzle-orm";
import { db, callsTable, jobsTable, assistantsTable, contactsTable, invoicesTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router = Router();

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

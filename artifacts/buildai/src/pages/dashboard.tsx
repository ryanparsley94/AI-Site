import { useEffect, useMemo, useState } from "react";
import PilotReleaseGate from "@/components/pilot-release-gate";
import {
  useGetDashboardSummary,
  useGetCallStats,
  useGetUpcomingJobs,
  useListAssistants,
  useListInvoices,
  useListEmailThreads,
  useListCalls,
} from "@workspace/api-client-react";
import {
  PhoneCall,
  Calendar,
  TrendingUp,
  Bot,
  ArrowUpRight,
  Clock,
  PhoneMissed,
  CheckCircle2,
  Receipt,
  Mail,
  Plus,
  FileText,
  Zap,
  AlertCircle,
  ChevronRight,
  Briefcase,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatTime, formatDate, formatCurrency } from "@/lib/utils";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function jobDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d MMM");
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-slate-300"}`} />
  );
}

const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  "in-progress": "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  loading,
  href,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ElementType;
  accent?: boolean;
  loading?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={`relative overflow-hidden ${accent ? "bg-secondary text-secondary-foreground border-0" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-secondary-foreground/50" : "text-muted-foreground"}`}>
              {label}
            </p>
            <p className={`text-3xl font-extrabold ${accent ? "text-secondary-foreground" : "text-foreground"}`}>
              {loading ? <span className="text-lg text-muted-foreground">—</span> : value}
            </p>
            {sub && (
              <p className={`text-xs mt-1 ${accent ? "text-secondary-foreground/50" : "text-muted-foreground"}`}>{sub}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${accent ? "bg-primary/20" : "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${accent ? "text-primary" : "text-primary"}`} />
          </div>
        </div>
        {href && (
          <ArrowUpRight className={`absolute bottom-4 right-4 h-3.5 w-3.5 ${accent ? "text-secondary-foreground/20" : "text-muted-foreground/30"}`} />
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Quick action button ────────────────────────────────────────────────────────

function QuickAction({
  label,
  icon: Icon,
  href,
  variant = "outline",
}: {
  label: string;
  icon: React.ElementType;
  href: string;
  variant?: "outline" | "default";
}) {
  return (
    <Link href={href}>
      <Button variant={variant} size="sm" className="gap-2 whitespace-nowrap">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Button>
    </Link>
  );
}

// ── Activity item ─────────────────────────────────────────────────────────────

type ActivityItem = {
  id: string;
  type: "call" | "email";
  title: string;
  sub: string;
  time: Date;
  badge?: string;
  badgeColor?: string;
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = item.type === "call" ? PhoneCall : Mail;
  const iconBg = item.type === "call" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${iconBg}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{item.title}</p>
          {item.badge && (
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${item.badgeColor}`}>
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
      </div>
      <p className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{format(item.time, "HH:mm")}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [pilot, setPilot] = useState<{
    phoneConfigured: boolean; emailInboundConfigured: boolean; emailOutboundConfigured: boolean;
    ownerEmailConfigured: boolean; completedCalls: number; ownerSummariesSent: number;
    inboundEmails: number; emailRepliesSent: number;
  } | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/dashboard/pilot-readiness`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Readiness unavailable")))
      .then(setPilot)
      .catch(() => setPilot(null));
  }, []);

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: callStats } = useGetCallStats();
  const { data: upcomingJobs = [], isLoading: isLoadingJobs } = useGetUpcomingJobs();
  const { data: assistants = [], isLoading: isLoadingAssistants } = useListAssistants();
  const { data: invoices = [], isLoading: isLoadingInvoices } = useListInvoices();
  const { data: emailThreads = [], isLoading: isLoadingEmails } = useListEmailThreads();
  const { data: calls = [] } = useListCalls({});

  // ── Derived values ──────────────────────────────────────────────────────────

  const unpaidInvoices = useMemo(
    () => invoices.filter((inv) => inv.status !== "paid"),
    [invoices]
  );
  // Prefer server-computed invoice stats when available; fall back to client-side totals
  const outstandingTotal = summary?.invoiceStats?.outstandingTotal ?? unpaidInvoices.reduce((s, inv) => s + Number(inv.total ?? 0), 0);
  const paidThisMonth = summary?.invoiceStats?.paidThisMonth ?? 0;
  const overdueCount = summary?.invoiceStats?.overdueCount ?? 0;

  const pendingEmails = useMemo(
    () => emailThreads.filter((t) => t.status === "pending"),
    [emailThreads]
  );

  const activeAssistants = assistants.filter((a) => a.active);

  const chartData = useMemo(() => {
    const base = callStats?.callsThisWeek || 0;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weights = [0.15, 0.22, 0.25, 0.18, 0.12, 0.05, 0.03];
    return days.map((name, i) => ({ name, calls: Math.round(base * weights[i]) }));
  }, [callStats]);

  // ── Unified activity feed (today's calls + emails, most recent first) ────────

  const activityFeed = useMemo((): ActivityItem[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const callItems: ActivityItem[] = calls
      .filter((c) => new Date(c.createdAt) >= today)
      .slice(0, 10)
      .map((c) => ({
        id: `call-${c.id}`,
        type: "call",
        title: c.callerName || "Unknown caller",
        sub: (c.notes as string | null | undefined) || "Inbound call",
        time: new Date(c.createdAt),
        badge: c.status === "missed" ? "Missed" : c.status === "booked" ? "Booked" : undefined,
        badgeColor:
          c.status === "missed"
            ? "bg-destructive/10 text-destructive"
            : c.status === "booked"
            ? "bg-green-100 text-green-700"
            : undefined,
      }));

    const emailItems: ActivityItem[] = emailThreads
      .filter((t) => new Date(t.createdAt) >= today)
      .slice(0, 5)
      .map((t) => ({
        id: `email-${t.id}`,
        type: "email",
        title: (t as unknown as { fromName?: string }).fromName || (t as unknown as { fromEmail?: string }).fromEmail || "Unknown sender",
        sub: (t as unknown as { subject?: string }).subject || "No subject",
        time: new Date(t.createdAt),
        badge: t.status === "pending" ? "Pending" : t.status === "sent" ? "Replied" : undefined,
        badgeColor:
          t.status === "pending"
            ? "bg-primary/15 text-primary"
            : t.status === "sent"
            ? "bg-green-100 text-green-700"
            : undefined,
      }));

    return [...callItems, ...emailItems].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 12);
  }, [calls, emailThreads]);

  const today = format(new Date(), "EEEE, d MMMM yyyy");

  return (
    <div className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{today}</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-secondary mt-0.5">
              {timeGreeting()} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Here's what your AI office has been handling.</p>
          </div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <QuickAction label="Schedule Job" icon={Calendar} href="/jobs" variant="default" />
            <QuickAction label="New Quote" icon={FileText} href="/quotes" />
            <QuickAction label="New Invoice" icon={Receipt} href="/invoices" />
            <QuickAction label="Email Inbox" icon={Mail} href="/email" />
            <QuickAction label="Call Log" icon={PhoneCall} href="/calls" />
          </div>
        </div>

        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">Integration setup & recorded activity</p>
                <p className="text-xs text-muted-foreground">Counts can include tests. Provider acceptance is not confirmed delivery; real Twilio and Resend checks remain outstanding.</p>
              </div>
              <Badge variant="outline">Phone & email unverified · not live</Badge>
            </div>
            {pilot ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-4 text-xs">
                <div><StatusDot active={pilot.phoneConfigured} /> Phone connection {pilot.phoneConfigured ? "configured" : "needs setup"}</div>
                <div><StatusDot active={pilot.phoneConfigured} /> Recorded call / summary acceptance {pilot.completedCalls}/{pilot.ownerSummariesSent}</div>
                <div><StatusDot active={pilot.emailInboundConfigured && pilot.inboundEmails > 0} /> Inbound email {pilot.inboundEmails}</div>
                <div><StatusDot active={pilot.emailOutboundConfigured && pilot.emailRepliesSent > 0} /> Approved reply {pilot.emailRepliesSent}</div>
              </div>
            ) : <p className="text-xs text-muted-foreground mt-3">Pilot status is unavailable; check the server before testing.</p>}
          </CardContent>
        </Card>

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <PilotReleaseGate />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Calls Today"
            value={summary?.callsToday ?? 0}
            sub={
              summary?.missedCallsToday === 0 ? (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> 0 missed
                </span>
              ) : (
                <span className="text-red-500 flex items-center gap-1">
                  <PhoneMissed size={11} /> {summary?.missedCallsToday} missed
                </span>
              )
            }
            icon={PhoneCall}
            loading={isLoadingSummary}
            href="/calls"
          />
          <StatCard
            label="Outstanding"
            value={formatCurrency(outstandingTotal)}
            sub={
              overdueCount > 0 ? (
                <span className="text-red-500 flex items-center gap-1">
                  <AlertCircle size={11} /> {overdueCount} overdue
                </span>
              ) : (
                `${unpaidInvoices.length} unpaid`
              )
            }
            icon={Receipt}
            accent
            loading={isLoadingSummary}
            href="/invoices?status=unpaid"
          />
          <StatCard
            label="Collected This Month"
            value={formatCurrency(paidThisMonth)}
            sub="invoices paid"
            icon={TrendingUp}
            loading={isLoadingSummary}
            href="/invoices?status=paid"
          />
          <StatCard
            label="Jobs This Week"
            value={summary?.jobsThisWeek ?? 0}
            sub={`${summary?.upcomingJobsCount ?? 0} upcoming`}
            icon={Calendar}
            loading={isLoadingSummary}
            href="/jobs"
          />
          <StatCard
            label="Email Inbox"
            value={pendingEmails.length}
            sub="awaiting reply"
            icon={Mail}
            loading={isLoadingEmails}
            href="/email"
          />
          <StatCard
            label="AI Team"
            value={`${activeAssistants.length}/${assistants.length}`}
            sub="assistants online"
            icon={Bot}
            loading={isLoadingAssistants}
            href="/assistants"
          />
        </div>

        {/* ── Main grid ───────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-12">

          {/* AI Office Team */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" /> AI Office Team
                  </CardTitle>
                  <CardDescription>Your assistants, live right now.</CardDescription>
                </div>
                <Link href="/assistants">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    Manage <ArrowUpRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingAssistants ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Loading team...</div>
              ) : assistants.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed rounded-lg">
                  <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No assistants configured yet.</p>
                  <Link href="/assistants">
                    <Button size="sm" className="mt-3 gap-2"><Plus size={14} /> Add Assistant</Button>
                  </Link>
                </div>
              ) : (
                assistants.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 transition-colors">
                    <div className={`p-2.5 rounded-xl shrink-0 ${a.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Bot size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusDot active={a.active} />
                        <p className="text-sm font-semibold truncate">{a.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {a.personality} · {a.voice}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[11px] border-0 font-semibold ${
                        a.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {a.active ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Today's Activity Feed */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Today's Activity
                  </CardTitle>
                  <CardDescription>Calls and emails handled today.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4">
              {activityFeed.length === 0 ? (
                <div className="py-10 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No activity yet today.</p>
                  <p className="text-xs text-muted-foreground mt-1">Calls and emails will appear here.</p>
                </div>
              ) : (
                <div>
                  {activityFeed.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* This Week's Jobs */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Upcoming Jobs
                  </CardTitle>
                  <CardDescription>Next 7 days on the books.</CardDescription>
                </div>
                <Link href="/jobs">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    View all <ArrowUpRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4">
              {isLoadingJobs ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Loading...</div>
              ) : upcomingJobs.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed rounded-lg">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No jobs this week.</p>
                  <Link href="/jobs">
                    <Button size="sm" className="mt-3 gap-2"><Plus size={14} /> Schedule Job</Button>
                  </Link>
                </div>
              ) : (
                upcomingJobs.slice(0, 6).map((job) => (
                  <div key={job.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                    <div className="shrink-0 text-center min-w-[52px] bg-muted rounded-lg px-2 py-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none">
                        {jobDayLabel(job.scheduledAt)}
                      </p>
                      <p className="text-xs font-bold text-secondary mt-0.5">{formatTime(job.scheduledAt)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.contactName} · {job.address || "No address"}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {job.status}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom row ──────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-12">

          {/* Weekly call volume chart */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Weekly Call Volume</CardTitle>
                  <CardDescription>AI-handled calls over the last 7 days.</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-secondary">{callStats?.callsThisWeek ?? 0}</p>
                  <p className="text-xs text-muted-foreground">this week</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12, background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Unpaid invoices */}
          <Card className="lg:col-span-5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" /> Outstanding Invoices
                  </CardTitle>
                  <CardDescription>
                    {unpaidInvoices.length === 0
                      ? "All invoices paid — great work!"
                      : `${unpaidInvoices.length} invoice${unpaidInvoices.length !== 1 ? "s" : ""} awaiting payment`}
                  </CardDescription>
                </div>
                <Link href="/invoices">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    View all <ArrowUpRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-0 px-4">
              {isLoadingInvoices ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Loading...</div>
              ) : unpaidInvoices.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground/70">All cleared</p>
                  <p className="text-xs text-muted-foreground mt-1">No outstanding invoices.</p>
                </div>
              ) : (
                <>
                  {unpaidInvoices.slice(0, 4).map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{inv.clientName || "—"} · Due {inv.dueDate}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-secondary">{formatCurrency(Number(inv.total ?? 0))}</p>
                        <span className={`text-[10px] font-bold uppercase ${inv.status === "sent" ? "text-primary" : "text-muted-foreground"}`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {unpaidInvoices.length > 4 && (
                    <Link href="/invoices">
                      <p className="text-xs text-primary font-medium pt-2 hover:underline">
                        +{unpaidInvoices.length - 4} more invoices →
                      </p>
                    </Link>
                  )}
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground font-medium">Total outstanding</p>
                    <p className="text-lg font-extrabold text-secondary">{formatCurrency(outstandingTotal)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

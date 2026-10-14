import { useMemo } from "react";
import {
  useGetCompany,
  useGetDashboardSummary,
  useGetPilotReadiness,
  useListAssistants,
  useListCalls,
  useListInvoices,
  useListJobs,
  useListQuotes,
  useListTasks,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Mail,
  Phone,
  PhoneMissed,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { format, isToday, parseISO, startOfDay } from "date-fns";
import { formatCurrency } from "@/lib/utils";

type PilotReadiness = {
  phoneConfigured: boolean;
  emailInboundConfigured: boolean;
  emailOutboundConfigured: boolean;
  ownerEmailConfigured: boolean;
  completedCalls: number;
  ownerSummariesSent: number;
  inboundEmails: number;
  emailRepliesSent: number;
};

type AttentionItem = {
  id: string;
  href: string;
  title: string;
  detail: string;
  label: string;
  tone: "critical" | "warning" | "neutral";
  icon: "call" | "quote" | "invoice" | "setup";
};

const londonDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

function StatusDot({ active }: { active: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${active ? "bg-primary shadow-[0_0_14px_rgba(54,198,213,.8)]" : "bg-muted-foreground/45"}`} />;
}

function Metric({
  label,
  value,
  meta,
  href,
  alert = false,
}: {
  label: string;
  value: string;
  meta: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group min-w-0 border-r border-white/8 px-4 py-4 last:border-r-0 hover:bg-white/[.025] sm:px-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{label}</p>
        <ArrowUpRight size={13} className="text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      <p className={`mt-2 font-mono text-2xl font-semibold tracking-[-.04em] ${alert ? "text-amber-300" : "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
    </Link>
  );
}

function PanelTitle({
  kicker,
  title,
  href,
  action,
}: {
  kicker: string;
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">{kicker}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-.025em] text-foreground">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary">
          {action || "Open"} <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="divide-y divide-border/70">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="py-4">
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-2.5 w-3/5 animate-pulse rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const companyQuery = useGetCompany();
  const summaryQuery = useGetDashboardSummary();
  const readinessQuery = useGetPilotReadiness<PilotReadiness>();
  const assistantsQuery = useListAssistants();
  const callsQuery = useListCalls({ limit: 50 });
  const jobsQuery = useListJobs();
  const invoicesQuery = useListInvoices();
  const quotesQuery = useListQuotes();
  const tasksQuery = useListTasks();

  const company = companyQuery.data;
  const summary = summaryQuery.data;
  const readiness = readinessQuery.data;
  const assistants = assistantsQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  const activePhoneAssistant = assistants.some((assistant) => assistant.active && assistant.type === "phone");
  const phoneReady = readiness?.phoneConfigured === true && activePhoneAssistant;
  const emailReady = readiness?.emailInboundConfigured === true && readiness?.emailOutboundConfigured === true;

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((job) => isToday(new Date(job.scheduledAt)) && job.status !== "cancelled")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [jobs],
  );

  const upcomingJobs = useMemo(
    () =>
      jobs
        .filter((job) => new Date(job.scheduledAt) >= startOfDay(new Date()) && job.status !== "cancelled" && job.status !== "completed")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, 6),
    [jobs],
  );

  const overdueInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status === "sent" && parseISO(invoice.dueDate) < startOfDay(new Date())),
    [invoices],
  );

  const outstanding = invoices
    .filter((invoice) => invoice.status === "sent")
    .reduce((total, invoice) => total + invoice.total, 0);

  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const highPriorityTasks = pendingTasks.filter((task) => task.priority === "high");
  const sentQuotes = quotes.filter((quote) => quote.status === "reviewed" && Boolean(quote.sharedAt));
  const acceptedQuotes = quotes.filter((quote) => quote.status === "accepted");

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    calls
      .filter((call) => (call.status === "missed" || call.status === "unresolved") && call.reviewed !== true)
      .slice(0, 4)
      .forEach((call) => {
        items.push({
          id: `call-${call.id}`,
          href: `/calls/${call.id}`,
          title: call.callerName || call.callerPhone,
          detail: call.outcome || call.notes || "Enquiry needs review",
          label: call.status === "missed" ? "Missed call" : "Unresolved",
          tone: "warning",
          icon: "call",
        });
      });

    overdueInvoices.slice(0, 3).forEach((invoice) => {
      items.push({
        id: `invoice-${invoice.id}`,
        href: "/invoices",
        title: `${invoice.invoiceNumber} · ${invoice.clientName || "Customer"}`,
        detail: `${formatCurrency(invoice.total)} · due ${format(parseISO(invoice.dueDate), "d MMM")}`,
        label: "Overdue",
        tone: "critical",
        icon: "invoice",
      });
    });

    sentQuotes
      .filter((quote) => quote.status !== "accepted")
      .slice(0, 3)
      .forEach((quote) => {
        items.push({
          id: `quote-${quote.id}`,
          href: "/quotes",
          title: quote.title,
          detail: quote.sharedAt ? `Sent ${format(new Date(quote.sharedAt), "d MMM")}` : "Sent to customer",
          label: "Awaiting reply",
          tone: "neutral",
          icon: "quote",
        });
      });

    if (!phoneReady) {
      items.push({
        id: "setup-phone",
        href: "/business-setup",
        title: activePhoneAssistant ? "Finish phone connection" : "Activate the AI receptionist",
        detail: activePhoneAssistant ? "The assistant exists but the phone connection is incomplete." : "No active phone assistant is configured.",
        label: "Setup",
        tone: "warning",
        icon: "setup",
      });
    }

    if (!emailReady) {
      items.push({
        id: "setup-email",
        href: "/business-setup",
        title: "Finish email connection",
        detail: "Inbound and outbound email are not both confirmed.",
        label: "Setup",
        tone: "neutral",
        icon: "setup",
      });
    }

    return items.slice(0, 8);
  }, [calls, overdueInvoices, sentQuotes, activePhoneAssistant, phoneReady, emailReady]);

  const anyError =
    companyQuery.isError ||
    summaryQuery.isError ||
    readinessQuery.isError ||
    assistantsQuery.isError ||
    callsQuery.isError ||
    jobsQuery.isError ||
    invoicesQuery.isError ||
    quotesQuery.isError ||
    tasksQuery.isError;

  const retryAll = () => {
    void companyQuery.refetch();
    void summaryQuery.refetch();
    void readinessQuery.refetch();
    void assistantsQuery.refetch();
    void callsQuery.refetch();
    void jobsQuery.refetch();
    void invoicesQuery.refetch();
    void quotesQuery.refetch();
    void tasksQuery.refetch();
  };

  return (
    <main className="crew-control-centre min-h-[100dvh] bg-background" data-testid="page-dashboard">
      <div className="border-b border-white/8 bg-[radial-gradient(circle_at_85%_-20%,rgba(54,198,213,.12),transparent_32%)]">
        <div className="mx-auto max-w-[1500px] px-4 pb-6 pt-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-primary">CREWON // CONTROL CENTRE</span>
                <span className="text-border">/</span>
                <span className="text-xs text-muted-foreground">{companyQuery.isLoading ? "Loading workspace…" : company?.name || "Business workspace"}</span>
              </div>
              <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-.055em] text-foreground sm:text-[2.3rem]">
                Run the business from here.
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span>{londonDate.format(new Date())}</span>
                <span className="hidden h-3 w-px bg-border sm:block" />
                <span className="inline-flex items-center gap-2">
                  <StatusDot active={phoneReady} />
                  {phoneReady ? "AI receptionist configured" : "AI receptionist needs attention"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <StatusDot active={emailReady} />
                  {emailReady ? "Email connected" : "Email setup incomplete"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/jobs" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus size={16} /> New job
              </Link>
              <Link href="/quotes" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card/60 px-4 text-sm font-medium hover:border-primary/50">
                <FileText size={15} /> Quote
              </Link>
              <Link href="/invoices" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card/60 px-4 text-sm font-medium hover:border-primary/50">
                <ReceiptText size={15} /> Invoice
              </Link>
              <Link href="/calls" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card/60 px-4 text-sm font-medium hover:border-primary/50">
                <Phone size={15} /> Enquiries
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 pb-12 sm:px-6 lg:px-8">
        <section className="-mt-px grid overflow-hidden border border-border bg-card/80 shadow-[0_18px_60px_rgba(0,0,0,.12)] sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Calls today"
            value={summaryQuery.isLoading ? "—" : String(summary?.callsToday ?? 0)}
            meta={summary?.missedCallsToday ? `${summary.missedCallsToday} missed` : "No missed calls recorded"}
            href="/calls"
            alert={Boolean(summary?.missedCallsToday)}
          />
          <Metric
            label="Jobs today"
            value={jobsQuery.isLoading ? "—" : String(todayJobs.length)}
            meta={summary ? `${summary.jobsThisWeek} booked this week` : "Weekly total unavailable"}
            href="/schedule"
          />
          <Metric
            label="Cash outstanding"
            value={invoicesQuery.isLoading ? "—" : formatCurrency(outstanding)}
            meta={overdueInvoices.length ? `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}` : "Nothing overdue"}
            href="/invoices"
            alert={overdueInvoices.length > 0}
          />
          <Metric
            label="Quote pipeline"
            value={quotesQuery.isLoading ? "—" : String(sentQuotes.length)}
            meta={`${acceptedQuotes.length} accepted · ${quotes.length} total`}
            href="/quotes"
          />
        </section>

        {anyError && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-muted-foreground">
            <CircleAlert size={15} className="text-amber-300" />
            Some live data could not be loaded.
            <button type="button" onClick={retryAll} className="font-semibold text-primary hover:underline">Retry now</button>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
          <div className="space-y-6">
            <section className="border border-border bg-card/65">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <PanelTitle kicker="01 / Action queue" title="Needs your attention" href="/tasks" action="Open tasks" />
              </div>
              <div data-testid="control-attention-list">
                {callsQuery.isLoading || invoicesQuery.isLoading || quotesQuery.isLoading || readinessQuery.isLoading ? (
                  <div className="px-5"><LoadingRows count={4} /></div>
                ) : attentionItems.length === 0 ? (
                  <div className="flex items-center gap-3 px-5 py-8">
                    <div className="flex h-9 w-9 items-center justify-center border border-primary/30 bg-primary/8 text-primary">
                      <Check size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Queue clear</p>
                      <p className="mt-1 text-xs text-muted-foreground">No calls, invoices or setup items need chasing right now.</p>
                    </div>
                  </div>
                ) : (
                  attentionItems.map((item, index) => {
                    const Icon = item.icon === "call" ? PhoneMissed : item.icon === "invoice" ? ReceiptText : item.icon === "quote" ? FileText : Settings2;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/70 px-4 py-3.5 first:border-t-0 hover:bg-white/[.025] sm:px-5"
                      >
                        <div className={`flex h-8 w-8 items-center justify-center border ${
                          item.tone === "critical"
                            ? "border-destructive/30 bg-destructive/8 text-destructive"
                            : item.tone === "warning"
                              ? "border-amber-400/30 bg-amber-400/8 text-amber-300"
                              : "border-border bg-muted/40 text-primary"
                        }`}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">{item.title}</span>
                            <span className={`px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${
                              item.tone === "critical"
                                ? "bg-destructive/10 text-destructive"
                                : item.tone === "warning"
                                  ? "bg-amber-400/10 text-amber-300"
                                  : "bg-muted text-muted-foreground"
                            }`}>{item.label}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">0{index + 1}</span>
                          <ChevronRight size={15} className="text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>

            <section className="border border-border bg-card/65">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <PanelTitle kicker="02 / Run sheet" title="Today on site" href="/schedule" action="Open scheduler" />
              </div>
              {jobsQuery.isLoading ? (
                <div className="px-5"><LoadingRows count={3} /></div>
              ) : todayJobs.length === 0 ? (
                <div className="px-5 py-8">
                  <p className="text-sm font-semibold">No jobs scheduled today</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use the scheduler to add work or move jobs into today.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {todayJobs.map((job, index) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="group grid grid-cols-[58px_minmax(0,1fr)_auto] gap-4 px-4 py-4 hover:bg-white/[.025] sm:px-5"
                    >
                      <div>
                        <p className="font-mono text-sm font-semibold text-primary">{format(new Date(job.scheduledAt), "HH:mm")}</p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">Job {String(index + 1).padStart(2, "0")}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Wrench size={13} className="shrink-0 text-muted-foreground" />
                          <p className="truncate text-sm font-semibold">{job.title}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{job.contactName}{job.address ? ` · ${job.address}` : ""}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">{job.status.replaceAll("_", " ")}</span>
                          {job.estimatedDuration ? <span className="text-[10px] text-muted-foreground">{Math.round(job.estimatedDuration / 60 * 10) / 10}h allowed</span> : null}
                          {job.assignedEngineer ? <span className="text-[10px] text-muted-foreground">{job.assignedEngineer}</span> : null}
                        </div>
                      </div>
                      <ArrowRight size={15} className="mt-1 text-muted-foreground/40 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <Link href="/tasks" className="group border border-border bg-card/55 p-4 hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <Clock3 size={16} className="text-primary" />
                  <ArrowUpRight size={13} className="text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="mt-5 font-mono text-2xl font-semibold">{pendingTasks.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Open tasks · {highPriorityTasks.length} high priority</p>
              </Link>
              <Link href="/jobs" className="group border border-border bg-card/55 p-4 hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <CalendarDays size={16} className="text-primary" />
                  <ArrowUpRight size={13} className="text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="mt-5 font-mono text-2xl font-semibold">{summary?.upcomingJobsCount ?? upcomingJobs.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Upcoming jobs in the live schedule</p>
              </Link>
              <Link href="/calls" className="group border border-border bg-card/55 p-4 hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <Phone size={16} className="text-primary" />
                  <ArrowUpRight size={13} className="text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="mt-5 font-mono text-2xl font-semibold">{summary ? `${Math.round(summary.bookingRate)}%` : "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Call-to-booking rate</p>
              </Link>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="border border-primary/25 bg-[linear-gradient(180deg,rgba(54,198,213,.06),rgba(32,48,56,.55))]">
              <div className="border-b border-primary/15 px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-primary">AI Office</p>
                    <h2 className="mt-1 text-lg font-semibold">Reception & response</h2>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center border border-primary/25 bg-primary/10 text-primary">
                    <Bot size={17} />
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border/70 px-5">
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium">Phone receptionist</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Inbound calls & booking</p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs font-medium">
                    <StatusDot active={phoneReady} />
                    {phoneReady ? "Configured" : "Needs setup"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium">Email desk</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Inbound + outbound</p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs font-medium">
                    <StatusDot active={emailReady} />
                    {emailReady ? "Connected" : "Needs setup"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium">Recorded activity</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Completed call records</p>
                  </div>
                  <span className="font-mono text-sm font-semibold">{readinessQuery.isLoading ? "—" : readiness?.completedCalls ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium">Replies sent</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Email responses</p>
                  </div>
                  <span className="font-mono text-sm font-semibold">{readinessQuery.isLoading ? "—" : readiness?.emailRepliesSent ?? 0}</span>
                </div>
              </div>

              <div className="px-5 pb-5 pt-1">
                <Link href="/assistants" className="flex min-h-10 items-center justify-between border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10">
                  Open AI Office <ArrowRight size={13} />
                </Link>
              </div>
            </section>

            <section className="border border-border bg-card/65">
              <div className="border-b border-border px-5 py-4">
                <PanelTitle kicker="03 / Money" title="Cash position" href="/invoices" action="Invoices" />
              </div>
              <div className="px-5">
                <div className="flex items-end justify-between gap-4 border-b border-border/70 py-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="mt-1 font-mono text-xl font-semibold">{invoicesQuery.isLoading ? "—" : formatCurrency(outstanding)}</p>
                  </div>
                  <ReceiptText size={18} className="text-primary" />
                </div>
                <div className="flex items-end justify-between gap-4 border-b border-border/70 py-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Paid this month</p>
                    <p className="mt-1 font-mono text-xl font-semibold">{summaryQuery.isLoading ? "—" : formatCurrency(summary?.invoiceStats?.paidThisMonth ?? 0)}</p>
                  </div>
                  <Check size={18} className="text-primary" />
                </div>
                <div className="flex items-end justify-between gap-4 py-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                    <p className={`mt-1 font-mono text-xl font-semibold ${overdueInvoices.length ? "text-amber-300" : ""}`}>{overdueInvoices.length}</p>
                  </div>
                  <CircleAlert size={18} className={overdueInvoices.length ? "text-amber-300" : "text-muted-foreground"} />
                </div>
              </div>
            </section>

            <section className="border border-border bg-card/65">
              <div className="border-b border-border px-5 py-4">
                <PanelTitle kicker="04 / Next up" title="Forward schedule" href="/schedule" action="View all" />
              </div>
              {jobsQuery.isLoading ? (
                <div className="px-5"><LoadingRows count={3} /></div>
              ) : upcomingJobs.length === 0 ? (
                <p className="px-5 py-6 text-xs text-muted-foreground">No upcoming work is currently scheduled.</p>
              ) : (
                <div className="divide-y divide-border/70 px-5">
                  {upcomingJobs.slice(0, 4).map((job) => (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="group flex items-center gap-3 py-3.5">
                      <div className="w-12 shrink-0">
                        <p className="font-mono text-[10px] uppercase text-primary">{format(new Date(job.scheduledAt), "EEE")}</p>
                        <p className="font-mono text-sm font-semibold">{format(new Date(job.scheduledAt), "d MMM")}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{job.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{job.contactName}</p>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground/45 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Link href="/email-inbox" className="group border border-border bg-card/55 p-4 hover:border-primary/40">
                <Mail size={16} className="text-primary" />
                <p className="mt-4 text-sm font-semibold">Inbox</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Customer email</p>
              </Link>
              <Link href="/business-setup" className="group border border-border bg-card/55 p-4 hover:border-primary/40">
                <ShieldCheck size={16} className="text-primary" />
                <p className="mt-4 text-sm font-semibold">Setup</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Connections & profile</p>
              </Link>
            </section>

            <div className="border-l-2 border-primary/40 px-4 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles size={13} className="text-primary" />
                CREWON principle
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                The dashboard should tell you what needs doing next — not make you hunt through software.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

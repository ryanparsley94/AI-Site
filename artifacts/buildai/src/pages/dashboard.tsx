import { useMemo } from "react";
import {
  useGetCompany,
  useGetDashboardSummary,
  useGetPilotReadiness,
  useListJobs,
  useListAssistants,
  useListCalls,
  useListInvoices,
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
  CircleAlert,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Phone,
  PhoneMissed,
  Plus,
  ReceiptText,
  Settings2,
  Wrench,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { OperationsMap } from "@/components/operations-map";

type FeedItem = {
  id: string;
  href: string;
  title: string;
  detail: string;
  at: Date;
  kind: "job" | "call" | "task";
  state?: string;
};

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

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

function dateLabel(value: Date) {
  if (isToday(value)) return "Today";
  if (isTomorrow(value)) return "Tomorrow";
  return format(value, "EEE d MMM");
}

function SectionHeading({ eyebrow, title, href, linkText }: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{eyebrow}</p>}
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {href && (
        <Link href={href} data-testid={`link-${linkText?.toLowerCase().replaceAll(" ", "-") || "view-all"}`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-primary">
          {linkText || "View all"} <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

function LoadingLines({ count = 3 }: { count?: number }) {
  return <div className="space-y-3 py-2" aria-label="Loading">
    {Array.from({ length: count }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-sm bg-muted/70" />)}
  </div>;
}

function ValueRow({ label, amount, note, href }: { label: string; amount: number | null; note?: string; href: string }) {
  return <Link href={href} data-testid={`link-finance-${label.toLowerCase().replaceAll(" ", "-")}`}
    className="group flex items-center justify-between gap-4 border-t border-border/70 py-3 first:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground group-hover:text-primary">
      {amount === null ? "—" : formatCurrency(amount)}
    </span>
  </Link>;
}

export default function Dashboard() {
  const companyQuery = useGetCompany();
  const summaryQuery = useGetDashboardSummary();
  // The current route returns configuration and observed-activity fields; its
  // generated schema is older, so keep this response aligned to the handler.
  const readinessQuery = useGetPilotReadiness<PilotReadiness>();
  // Home and Scheduler share the same live job collection so saved schedule
  // changes invalidate and appear consistently in both views.
  const jobsQuery = useListJobs();
  const assistantsQuery = useListAssistants();
  const invoicesQuery = useListInvoices();
  const quotesQuery = useListQuotes();
  const callsQuery = useListCalls({ limit: 50 });
  const tasksQuery = useListTasks();

  const company = companyQuery.data;
  const summary = summaryQuery.data;
  const readiness = readinessQuery.data;
  const jobs = jobsQuery.data ?? [];
  const todayJobs = jobs.filter((job) => isToday(new Date(job.scheduledAt)) && job.status !== "cancelled")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const assistants = assistantsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const calls = callsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const activePhoneAssistant = assistants.some((assistant) => assistant.active && assistant.type === "phone");
  const attentionItems = useMemo(() => {
    const missedCalls = calls
      .filter((call) => (call.status === "missed" || call.status === "unresolved") && call.reviewed !== true)
      .slice(0, 4)
      .map((call) => ({
        id: `call-${call.id}`,
        href: `/calls/${call.id}`,
        title: call.status === "missed" ? `Missed call · ${call.callerName || call.callerPhone}` : `Follow up · ${call.callerName || call.callerPhone}`,
        detail: call.outcome || call.notes || "Enquiry needs a review",
        kind: "call" as const,
        date: new Date(call.createdAt),
        badge: call.status === "missed" ? "Missed call" : "Unresolved",
      }));
    const waitingQuotes = quotes
      .filter((quote) => quote.status === "reviewed" && Boolean(quote.sharedAt))
      .slice(0, 4)
      .map((quote) => ({
        id: `quote-${quote.id}`,
        href: "/quotes",
        title: quote.title,
        detail: `Sent ${format(new Date(quote.sharedAt as string), "d MMM")}`,
        kind: "quote" as const,
        date: new Date(quote.sharedAt as string),
        badge: "Awaiting response",
      }));
    const overdueInvoices = invoices
      .filter((invoice) => invoice.status === "sent" && parseISO(invoice.dueDate) < startOfDay(new Date()))
      .slice(0, 4)
      .map((invoice) => ({
        id: `invoice-${invoice.id}`,
        href: "/invoices",
        title: `${invoice.invoiceNumber} · ${invoice.clientName || "Customer"}`,
        detail: `${formatCurrency(invoice.total)} · due ${format(parseISO(invoice.dueDate), "d MMM")}`,
        kind: "invoice" as const,
        date: parseISO(invoice.dueDate),
        badge: "Overdue",
      }));
    const setupItems = [
      ...(readiness && !activePhoneAssistant ? [{ id: "assistant", title: "Activate a phone assistant", detail: "No active phone assistant is configured." }] : []),
      ...(readiness && !readiness.phoneConfigured ? [{ id: "phone", title: "Connect the phone line", detail: "Phone credentials or public callback URL are missing." }] : []),
      ...(readiness && !readiness.emailInboundConfigured ? [{ id: "email-inbound", title: "Set up inbound email", detail: "Inbound email is not configured." }] : []),
      ...(readiness && !readiness.emailOutboundConfigured ? [{ id: "email-outbound", title: "Set up outbound email", detail: "Outbound email is not configured." }] : []),
      ...(readiness && !readiness.ownerEmailConfigured ? [{ id: "owner-email", title: "Add the business email", detail: "No business contact email is configured." }] : []),
    ].slice(0, 3).map((item) => ({
      id: `setup-${item.id}`,
      href: "/business-setup",
      title: item.title,
      detail: item.detail,
      kind: "setup" as const,
      date: null,
      badge: "Setup blocker",
    }));
    return [...missedCalls, ...waitingQuotes, ...overdueInvoices, ...setupItems];
  }, [calls, quotes, invoices, readiness, activePhoneAssistant]);

  const feed = useMemo(() => {
    const jobItems: FeedItem[] = jobs
      .filter((job) => job.status !== "cancelled" && job.status !== "completed")
      .map((job) => ({
        id: `job-${job.id}`,
        href: `/jobs/${job.id}`,
        title: job.title,
        detail: `${job.contactName}${job.address ? ` · ${job.address}` : ""}`,
        at: new Date(job.scheduledAt),
        kind: "job",
        state: job.status.replaceAll("_", " "),
      }));
    const todayStart = startOfDay(new Date());
    const callItems: FeedItem[] = calls
      .filter((call) => isToday(new Date(call.createdAt)))
      .slice(0, 8)
      .map((call) => ({
        id: `call-${call.id}`,
        href: `/calls/${call.id}`,
        title: call.status === "missed" ? `Missed call · ${call.callerName || call.callerPhone}` : `Enquiry · ${call.callerName || call.callerPhone}`,
        detail: call.outcome || call.notes || call.status,
        at: new Date(call.createdAt),
        kind: "call",
        state: call.status,
      }));
    const taskItems: FeedItem[] = tasks
      .filter((task) => task.status === "pending" && task.dueDate && new Date(task.dueDate) >= todayStart && isToday(new Date(task.dueDate)))
      .map((task) => ({
        id: `task-${task.id}`,
        href: "/tasks",
        title: task.title,
        detail: `${task.priority} priority · due today`,
        at: new Date(task.dueDate as string),
        kind: "task",
        state: "To do",
      }));
    return [...jobItems, ...callItems, ...taskItems]
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 12);
  }, [jobs, calls, tasks]);

  const sentQuotes = quotes.filter((quote) => quote.status === "reviewed" && Boolean(quote.sharedAt));
  const acceptedQuotes = quotes.filter((quote) => quote.status === "accepted");
  const openQuotes = quotes.filter((quote) => quote.status !== "accepted");
  const paidThisMonth = summary?.invoiceStats?.paidThisMonth ?? null;
  const outstanding = invoicesQuery.isLoading || invoicesQuery.isError
    ? null
    : invoices.filter((invoice) => invoice.status === "sent").reduce((total, invoice) => total + invoice.total, 0);
  const hasPhoneConnection = readiness?.phoneConfigured === true;
  const attentionSourceError = callsQuery.isError || quotesQuery.isError || invoicesQuery.isError || readinessQuery.isError || assistantsQuery.isError;
  const setupBlockers = [
    ...(readiness && !activePhoneAssistant ? ["Active phone assistant"] : []),
    ...(readiness && !readiness.phoneConfigured ? ["Phone connection"] : []),
    ...(readiness && !readiness.emailInboundConfigured ? ["Inbound email"] : []),
    ...(readiness && !readiness.emailOutboundConfigured ? ["Outbound email"] : []),
    ...(readiness && !readiness.ownerEmailConfigured ? ["Business email"] : []),
  ];

  return (
    <main className="crew-dashboard min-h-[100dvh] bg-background px-4 pb-10 pt-5 sm:px-6 lg:px-8" data-testid="page-dashboard">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-col gap-4 border-b border-border/80 pb-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-[.13em] text-primary">Operations</span>
              <span className="text-border">/</span>
              <span data-testid="text-workspace-name">{companyQuery.isLoading ? "Loading workspace…" : company?.name || "Business workspace"}</span>
              <span className="hidden text-border sm:inline">/</span>
              <span data-testid="text-dashboard-date">{dayFormatter.format(new Date())}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-.04em] text-foreground sm:text-3xl">Your working day</h1>
              <span data-testid="status-receptionist" className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-[11px] font-medium ${
                hasPhoneConnection && activePhoneAssistant ? "border-primary/35 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${hasPhoneConnection && activePhoneAssistant ? "bg-primary" : activePhoneAssistant ? "bg-amber-400" : "bg-muted-foreground/60"}`} />
                {readinessQuery.isLoading || assistantsQuery.isLoading ? "Checking receptionist" : readinessQuery.isError || assistantsQuery.isError ? "Receptionist status unavailable" : activePhoneAssistant && hasPhoneConnection ? "Receptionist configured · live test unverified" : activePhoneAssistant ? "Receptionist active · phone setup incomplete" : "Receptionist not configured"}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">Calls, work booked and money due — in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/jobs" data-testid="button-schedule-job" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus size={16} /> Schedule a job
            </Link>
            <Link href="/calls" data-testid="button-review-enquiries" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
              <Phone size={15} /> Enquiries
            </Link>
            <Link href="/quotes" data-testid="button-new-quote" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
              <FileText size={15} /> New quote
            </Link>
            <Link href="/invoices" data-testid="button-new-invoice" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
              <ReceiptText size={15} /> New invoice
            </Link>
            <Link href="/email-inbox" data-testid="button-open-email" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
              <Mail size={15} /> Email inbox
            </Link>
          </div>
        </header>

        {(companyQuery.isError || summaryQuery.isError || jobsQuery.isError || callsQuery.isError || tasksQuery.isError || invoicesQuery.isError || quotesQuery.isError || readinessQuery.isError || assistantsQuery.isError) && (
          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-amber-400 bg-card px-4 py-3 text-xs text-muted-foreground" data-testid="status-dashboard-partial-error">
            <CircleAlert size={15} className="text-amber-400" />
            Some operational data could not be loaded. Values below are shown only where the service returned them.
            <button className="font-semibold text-primary hover:underline" onClick={() => {
              void companyQuery.refetch(); void summaryQuery.refetch(); void jobsQuery.refetch(); void callsQuery.refetch();
              void tasksQuery.refetch(); void invoicesQuery.refetch(); void quotesQuery.refetch(); void readinessQuery.refetch(); void assistantsQuery.refetch();
            }} data-testid="button-retry-dashboard">Retry</button>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.48fr)_minmax(330px,.82fr)]">
          <section className="min-w-0" aria-labelledby="attention-title">
            <div className="mb-3 flex items-end justify-between gap-4">
              <SectionHeading eyebrow="Priority queue" title="Needs your attention" href="/calls" linkText="Open work" />
              {!callsQuery.isLoading && !quotesQuery.isLoading && !invoicesQuery.isLoading && !readinessQuery.isLoading && (
                <span className="mb-0.5 font-mono text-xs text-muted-foreground" data-testid="text-attention-count">{attentionItems.length} items</span>
              )}
            </div>
            <div className="overflow-hidden rounded-sm border border-border bg-card" data-testid="list-needs-attention">
              {callsQuery.isLoading || quotesQuery.isLoading || invoicesQuery.isLoading || readinessQuery.isLoading ? <div className="p-4"><LoadingLines count={4} /></div>
                : attentionItems.length === 0 && attentionSourceError ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground" data-testid="status-attention-unavailable">
                    Attention status could not be fully checked. Some calls, quotes, invoices or setup data failed to load.
                  </div>
                ) : attentionItems.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-6" data-testid="status-attention-empty">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary"><Check size={17} /></div>
                    <div><p className="text-sm font-medium">Nothing needs chasing right now</p><p className="mt-0.5 text-xs text-muted-foreground">New follow-ups and overdue work will appear here.</p></div>
                  </div>
                ) : attentionItems.map((item) => (
                  <Link key={item.id} href={item.href} data-testid={`row-attention-${item.id}`}
                    className="group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/70 px-4 py-3 first:border-0 hover:bg-muted/40">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-sm ${
                      item.kind === "call" ? "bg-amber-400/10 text-amber-300" : item.kind === "invoice" ? "bg-destructive/10 text-destructive" : item.kind === "setup" ? "bg-amber-400/10 text-amber-300" : "bg-primary/10 text-primary"
                    }`}>
                      {item.kind === "call" ? <PhoneMissed size={14} /> : item.kind === "invoice" ? <ReceiptText size={14} /> : item.kind === "setup" ? <Settings2 size={14} /> : <FileText size={14} />}
                    </div>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                        <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          item.badge === "Missed call" || item.badge === "Overdue" || item.badge === "Setup blocker" ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground"
                        }`}>{item.badge}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <ArrowRight size={15} className="text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                ))}
            </div>
          </section>

          <section className="min-w-0 rounded-sm border border-border bg-card px-4 py-4 sm:px-5" aria-label="Financial summary">
            <SectionHeading eyebrow="Cash & commitments" title="Money snapshot" href="/invoices" linkText="Invoices" />
            <div className="mt-3 border-y border-border/70">
              <ValueRow label="Quotes sent" amount={quotesQuery.isError ? null : sentQuotes.reduce((sum, quote) => sum + Number(quote.totalIncVat ?? quote.grandTotal ?? 0), 0)} note={quotesQuery.isLoading ? "Loading quote totals" : `${sentQuotes.length} awaiting response`} href="/quotes" />
              <ValueRow label="Quotes accepted" amount={quotesQuery.isError ? null : acceptedQuotes.reduce((sum, quote) => sum + Number(quote.totalIncVat ?? quote.grandTotal ?? 0), 0)} note={quotesQuery.isLoading ? "Loading quote totals" : `${acceptedQuotes.length} accepted`} href="/quotes" />
              <ValueRow label="Open quote pipeline" amount={quotesQuery.isError ? null : openQuotes.reduce((sum, quote) => sum + Number(quote.totalIncVat ?? quote.grandTotal ?? 0), 0)} note={quotesQuery.isLoading ? "Loading quote totals" : `${openQuotes.length} open, includes drafts`} href="/quotes" />
              <ValueRow label="Invoices outstanding" amount={outstanding} note={invoicesQuery.isLoading ? "Loading invoice totals" : invoicesQuery.isError ? "Invoice data unavailable" : `${invoices.filter((invoice) => invoice.status === "sent").length} sent, unpaid; excludes drafts`} href="/invoices" />
              <ValueRow label="Paid this month" amount={paidThisMonth} note={summaryQuery.isError ? "Summary unavailable" : "Current calendar month"} href="/invoices" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Work in progress</span>
              <Link href="/jobs" className="inline-flex items-center gap-1 text-xs font-medium text-primary" data-testid="link-open-schedule">
                {summaryQuery.isLoading ? "—" : summary?.upcomingJobsCount ?? "—"} upcoming jobs <ArrowUpRight size={12} />
              </Link>
            </div>
          </section>
        </div>

        <section className="mt-7" aria-label="Today's jobs and operations map">
          <div className="mb-3"><SectionHeading eyebrow="Dispatch" title="Today’s jobs & operations map" href="/schedule" linkText="Open scheduler" /></div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,.75fr)]">
            <div className="overflow-hidden border border-border bg-card" data-testid="list-todays-jobs">
              {jobsQuery.isLoading ? <div className="p-4"><LoadingLines count={3} /></div> : jobsQuery.isError ? <p className="p-5 text-sm text-muted-foreground">Today’s jobs could not be loaded.</p> :
                todayJobs.length === 0 ? <div className="px-4 py-7"><p className="text-sm font-medium">No jobs scheduled today</p><p className="mt-1 text-xs text-muted-foreground">New and rescheduled work will appear here automatically.</p><Link href="/jobs" className="mt-3 inline-flex text-xs font-medium text-primary">Create or schedule a job <ArrowUpRight size={12} className="ml-1" /></Link></div> :
                <div className="divide-y divide-border">{todayJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} data-testid={`today-job-${job.id}`} className="grid gap-2 px-4 py-3 hover:bg-muted/30 sm:grid-cols-[54px_minmax(0,1fr)_auto] sm:items-center">
                  <span className="font-mono text-xs tabular-nums text-primary">{format(new Date(job.scheduledAt), "HH:mm")}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{job.title} · {job.contactName}</span><span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin size={12} />{job.address || "Site address not recorded"}</span></span>
                   <span className="text-left text-[11px] capitalize text-muted-foreground sm:text-right">{job.status.replaceAll("_", " ")} · {job.assignedEngineer || "Unassigned"}</span>
                </Link>)}</div>}
            </div>
            <OperationsMap jobs={jobs} />
          </div>
        </section>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.48fr)_minmax(330px,.82fr)]">
          <section className="min-w-0" aria-label="Today's operational timeline">
            <div className="mb-3 flex items-end justify-between gap-4">
              <SectionHeading eyebrow="The day ahead" title="Today" href="/jobs" linkText="Full schedule" />
              {summary && <span className="mb-0.5 font-mono text-[11px] text-muted-foreground">{summary.callsToday} calls · {summary.jobsThisWeek} jobs this week</span>}
            </div>
            <div className="rounded-sm border border-border bg-card px-4 sm:px-5" data-testid="list-today-timeline">
              {jobsQuery.isLoading || callsQuery.isLoading || tasksQuery.isLoading ? <LoadingLines count={4} />
                : feed.length === 0 && (jobsQuery.isError || callsQuery.isError || tasksQuery.isError) ? (
                  <div className="py-7 text-center text-sm text-muted-foreground" data-testid="status-timeline-unavailable">
                    Activity could not be fully checked because one or more sources failed to load.
                  </div>
                ) : feed.length === 0 ? (
                  <div className="py-7 text-center" data-testid="status-timeline-empty">
                    <CalendarDays size={20} className="mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No scheduled activity showing</p>
                    <p className="mt-1 text-xs text-muted-foreground">Jobs, enquiries and due tasks will appear here.</p>
                  </div>
                ) : feed.map((item, index) => (
                  <Link href={item.href} key={item.id} data-testid={`row-timeline-${item.id}`}
                    className="group grid grid-cols-[58px_16px_minmax(0,1fr)_auto] items-start gap-3 border-t border-border/70 py-3 first:border-t-0">
                    <span className="pt-0.5 text-right font-mono text-[10px] leading-4 text-muted-foreground">
                      {dateLabel(item.at)}<br />{format(item.at, "HH:mm")}
                    </span>
                    <span className="relative flex h-full justify-center">
                      {index < feed.length - 1 && <span className="absolute bottom-[-13px] top-2 w-px bg-border" />}
                      <span className={`relative z-10 mt-1 h-2 w-2 rounded-full ring-4 ring-card ${
                        item.kind === "job" ? "bg-primary" : item.kind === "call" ? "bg-amber-300" : "bg-muted-foreground"
                      }`} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        {item.kind === "job" ? <Wrench size={12} className="shrink-0 text-primary" /> : item.kind === "call" ? <Phone size={12} className="shrink-0 text-amber-300" /> : <Check size={12} className="shrink-0 text-muted-foreground" />}
                        <span className="truncate text-sm font-medium group-hover:text-primary">{item.title}</span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[18px] text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <span className="mt-0.5 max-w-[110px] truncate text-right text-[10px] capitalize text-muted-foreground">{item.state}</span>
                  </Link>
                ))}
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-sm border border-border bg-card px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-primary">AI Office</p>
                  <h2 className="text-base font-semibold tracking-tight">Reception & response</h2>
                </div>
                <Bot size={17} className="mt-1 text-primary" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/70 py-3">
                <span className="text-xs text-muted-foreground">Phone assistant</span>
                <span className="text-xs font-medium">{assistantsQuery.isLoading ? "Checking…" : assistantsQuery.isError ? "Unavailable" : activePhoneAssistant ? "Active configuration" : "Not configured"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 py-3">
                <span className="text-xs text-muted-foreground">Pilot verification</span>
                <span className={`text-xs font-medium ${readiness?.completedCalls ? "text-primary" : "text-amber-300"}`}>
                  {readinessQuery.isLoading ? "Checking…" : readinessQuery.isError ? "Unavailable" : readiness?.completedCalls ? `${readiness.completedCalls} completed call record${readiness.completedCalls === 1 ? "" : "s"} · live test unverified` : "No completed call record"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 py-3">
                <span className="text-xs text-muted-foreground">Email</span>
                <span className="text-right text-xs font-medium">
                  {readinessQuery.isLoading ? "Checking…" : readinessQuery.isError ? "Unavailable" :
                    `In ${readiness?.emailInboundConfigured ? "configured" : "not set"} · out ${readiness?.emailOutboundConfigured ? "configured" : "not set"} · ${readiness?.emailRepliesSent ?? 0} replies sent`}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 py-3">
                <span className="text-xs text-muted-foreground">Follow-up automation</span>
                <span className="text-xs font-medium text-muted-foreground">Not verified by current status data</span>
              </div>
              <Link href="/assistants" data-testid="link-manage-ai-office" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Manage AI Office <ArrowUpRight size={12} /></Link>
            </section>

            <section className="rounded-sm border border-border bg-card px-4 py-4 sm:px-5" data-testid="panel-pilot-readiness">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Pilot status</p>
                  <h2 className="text-sm font-semibold">Readiness checks</h2>
                </div>
                <Link href="/business-setup" data-testid="link-business-setup" className="text-xs font-medium text-primary hover:underline">Setup <ArrowUpRight size={12} className="ml-1 inline" /></Link>
              </div>
              {readinessQuery.isLoading ? <div className="mt-3"><LoadingLines count={2} /></div>
                : readinessQuery.isError ? <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">Setup status is unavailable; configuration cannot be confirmed.</p>
                : setupBlockers.length ? (
                  <div className="mt-3 border-t border-border/70 pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">{setupBlockers.length} setup item{setupBlockers.length === 1 ? "" : "s"} reported by current configuration</p>
                    <div className="space-y-2">
                      {setupBlockers.slice(0, 3).map((item) => <p key={item} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{item}</span> needs setup
                        </p>)}
                    </div>
                  </div>
                ) : <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">Phone and email configuration is present. Real-world service delivery has not been verified here.</p>}
            </section>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/email-inbox" data-testid="link-email-inbox" className="group flex items-center justify-between rounded-sm border border-border bg-card px-4 py-3 hover:border-primary/40">
            <span className="flex items-center gap-3"><Mail size={16} className="text-primary" /><span><span className="block text-sm font-medium">Email inbox</span><span className="block text-xs text-muted-foreground">Review customer messages</span></span></span><ArrowUpRight size={14} className="text-muted-foreground group-hover:text-primary" />
          </Link>
          <Link href="/tasks" data-testid="link-task-list" className="group flex items-center justify-between rounded-sm border border-border bg-card px-4 py-3 hover:border-primary/40">
            <span className="flex items-center gap-3"><Clock3 size={16} className="text-primary" /><span><span className="block text-sm font-medium">Tasks</span><span className="block text-xs text-muted-foreground">{tasksQuery.isLoading ? "Loading due work" : `${tasks.filter((task) => task.status === "pending").length} pending tasks`}</span></span></span><ArrowUpRight size={14} className="text-muted-foreground group-hover:text-primary" />
          </Link>
          <Link href="/business-setup" data-testid="link-business-settings" className="group flex items-center justify-between rounded-sm border border-border bg-card px-4 py-3 hover:border-primary/40">
            <span className="flex items-center gap-3"><Settings2 size={16} className="text-primary" /><span><span className="block text-sm font-medium">Business setup</span><span className="block text-xs text-muted-foreground">Company profile & connections</span></span></span><ArrowUpRight size={14} className="text-muted-foreground group-hover:text-primary" />
          </Link>
        </div>
      </div>
    </main>
  );
}

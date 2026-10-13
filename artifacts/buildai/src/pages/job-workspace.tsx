import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { format, isValid, parseISO } from "date-fns";
import {
  ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, ClipboardList, Clock3,
  FileCheck2, FileText, HardHat, History, Mail, MapPin, MessageSquareText, Package,
  Phone, ReceiptText, ShieldCheck, StickyNote, UserRound, Wrench, Image as ImageIcon,
  CircleHelp, Pencil, Save, X, RefreshCw
} from "lucide-react";
import {
  getGetJobQueryKey, useGetJob, useListCalls,
  useListCertificates, useListContacts, useListEmailThreads, useListInvoices,
  useListQuotes, useListTasks, useUpdateJob
} from "@workspace/api-client-react";
import type { Job } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { JobMarketingMessages } from "@/components/job-marketing-messages";
import { formatCurrency } from "@/lib/utils";
import type { ReactNode } from "react";

type WorkspaceTab =
  | "overview" | "customer" | "schedule" | "quotes" | "purchase-orders" | "invoices"
  | "certificates" | "documents" | "notes" | "communications" | "tasks" | "history";

const tabs: { id: WorkspaceTab; label: string; icon: typeof Wrench }[] = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "customer", label: "Customer / Site", icon: UserRound },
  { id: "schedule", label: "Appointments", icon: CalendarDays },
  { id: "quotes", label: "Quotes", icon: FileText },
  { id: "purchase-orders", label: "Purchase orders", icon: Package },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
  { id: "certificates", label: "Certificates", icon: ShieldCheck },
  { id: "documents", label: "Photos / Documents", icon: ImageIcon },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "communications", label: "Communications", icon: MessageSquareText },
  { id: "tasks", label: "Tasks / Next actions", icon: Check },
  { id: "history", label: "Job history", icon: History },
];

const statusLabels: Record<string, string> = {
  pending_confirmation: "Awaiting confirmation",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function dateLabel(value?: string | null, pattern = "EEE, d MMM yyyy · HH:mm") {
  if (!value) return "Not scheduled";
  const date = parseISO(value);
  return isValid(date) ? format(date, pattern) : "Date unavailable";
}

function EmptyState({ title, detail, link, href }: { title: string; detail: string; link?: string; href?: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border/80 bg-background/30 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><CircleHelp size={17} /></span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      {link && href && <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80" data-testid="link-empty-state">{link}<ArrowUpRight size={14} /></Link>}
    </div>
  );
}

function SectionHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return <div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">{eyebrow}</p><h2 className="workspace-title mt-1 text-2xl font-semibold text-foreground">{title}</h2>{note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}</div>;
}

function DataRow({ label, value, testId }: { label: string; value?: string | number | null; testId?: string }) {
  return <div className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span><span className="text-sm font-medium text-foreground" data-testid={testId}>{value || "Not recorded"}</span></div>;
}

export default function JobWorkspace() {
  const [, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const jobQuery = useGetJob(id, { query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetJobQueryKey(id) } });
  const { data: quotes = [], isLoading: quotesLoading, isError: quotesError, refetch: refetchQuotes } = useListQuotes({ jobId: id });
  const { data: invoices = [], isLoading: invoicesLoading, isError: invoicesError, refetch: refetchInvoices } = useListInvoices({ jobId: id });
  const { data: allCalls = [], isLoading: callsLoading, isError: callsError } = useListCalls();
  const { data: certificates = [], isLoading: certificatesLoading, isError: certificatesError } = useListCertificates();
  const { data: allTasks = [], isLoading: tasksLoading, isError: tasksError } = useListTasks();
  const { data: allThreads = [], isLoading: threadsLoading, isError: threadsError } = useListEmailThreads();
  const { data: contacts = [] } = useListContacts();
  const updateJob = useUpdateJob();

  const job = jobQuery.data;
  const contact = useMemo(() => job?.contactId ? contacts.find((item) => item.id === job.contactId) : undefined, [job?.contactId, contacts]);
  const calls = useMemo(() => allCalls.filter((call) => call.jobId === id), [allCalls, id]);
  const jobCertificates = useMemo(() => certificates.filter((certificate) => certificate.jobId === String(id)), [certificates, id]);
  const emails = useMemo(() => job?.contactId ? allThreads.filter((thread) => thread.contactId === job.contactId) : [], [allThreads, job?.contactId]);
  const pendingTaskCount = allTasks.filter((task) => task.status === "pending").length;

  const saveNotes = () => {
    updateJob.mutate({ id, data: { notes: notesDraft } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
        toast({ title: "Job notes saved" });
        setEditingNotes(false);
      },
      onError: () => toast({ title: "Could not save notes", description: "Please try again.", variant: "destructive" })
    });
  };

  if (jobQuery.isLoading) {
    return <main className="job-workspace min-h-[calc(100dvh-2rem)] px-4 py-6 sm:px-8"><div className="mx-auto max-w-7xl animate-pulse space-y-5"><div className="h-4 w-36 rounded bg-muted" /><div className="h-32 rounded-2xl bg-card" /><div className="h-14 rounded-xl bg-card" /><div className="h-64 rounded-2xl bg-card" /></div></main>;
  }
  if (jobQuery.isError || !job) {
    return <main className="job-workspace flex min-h-[70dvh] items-center justify-center px-5"><div className="max-w-md text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><CircleHelp size={22} /></div><h1 className="workspace-title text-2xl font-semibold">Job record unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This job may have been removed, or its details could not be loaded.</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => jobQuery.refetch()} data-testid="button-retry-job"><RefreshCw size={15} className="mr-2" />Try again</Button><Button onClick={() => setLocation("/jobs")} data-testid="button-return-jobs">Back to jobs</Button></div></div></main>;
  }

  const status = statusLabels[job.status] ?? job.status;
  const value = job.estimatedValue ? formatCurrency(Number(job.estimatedValue)) : "Not estimated";
  const target = tabs.find((item) => item.id === activeTab)?.label ?? "Overview";
  const statusTone = job.status === "completed" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : job.status === "in_progress" ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : job.status === "cancelled" ? "border-rose-300/20 bg-rose-300/10 text-rose-200" : "border-primary/20 bg-primary/10 text-primary";

  return (
    <main className="job-workspace min-h-[calc(100dvh-2rem)] px-3 py-5 sm:px-6 lg:px-8" data-testid={`job-workspace-${id}`}>
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/jobs" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" data-testid="link-back-to-jobs"><ArrowLeft size={16} />All jobs</Link>
          <span className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-muted-foreground sm:inline-flex"><HardHat size={14} className="text-primary" />CREWON / JOB RECORD</span>
        </div>

        <section className="workspace-panel relative overflow-hidden rounded-2xl px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,.12)] sm:px-7 sm:py-6">
          <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full border border-primary/10" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold tracking-wider text-primary">JOB-{String(job.id).padStart(4, "0")}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                <span className="text-xs text-muted-foreground">{job.serviceType}</span>
                <Badge variant="outline" className={`ml-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone}`} data-testid={`status-job-${job.id}`}>{status}</Badge>
              </div>
              <h1 className="workspace-title max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-4xl">{job.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><UserRound size={15} className="text-primary" />{job.contactName}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-primary" />{job.address || "Site address not recorded"}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`tel:${job.contactPhone}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background/55 px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5" data-testid="link-call-customer"><Phone size={15} />Call customer</a>
              <Button variant="outline" onClick={() => { setNotesDraft(job.notes ?? ""); setActiveTab("notes"); setEditingNotes(true); }} className="gap-2" data-testid="button-edit-job-notes"><Pencil size={15} />Add note</Button>
            </div>
          </div>
          <JobMarketingMessages key={job.id} job={job} />
        </section>

        <div className="workspace-nav -mx-3 my-4 flex gap-1 overflow-x-auto border-b border-border/80 px-3 sm:mx-0 sm:px-0">
          {tabs.map(({ id: tab, label, icon: Icon }) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`workspace-nav-item mb-[-1px] inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold ${activeTab === tab ? "border-primary bg-primary/[.06] text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} aria-current={activeTab === tab ? "page" : undefined} data-testid={`tab-job-${tab}`}>
              <Icon size={15} />{label}
              {tab === "quotes" && quotes.length > 0 && <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{quotes.length}</span>}
              {tab === "invoices" && invoices.length > 0 && <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{invoices.length}</span>}
            </button>
          ))}
        </div>

        <section className="workspace-enter" key={activeTab} data-testid={`section-job-${activeTab}`}>
          {activeTab === "overview" && <Overview job={job} quotes={quotes} invoices={invoices} certificates={jobCertificates} calls={calls} setActiveTab={setActiveTab} quotesError={quotesError} invoicesError={invoicesError} />}
          {activeTab === "customer" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="People & place" title="Customer and site" note="The customer and location details recorded against this work order." /><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-border/70 bg-background/25 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserRound size={16} className="text-primary" />Customer</div><DataRow label="Name" value={job.contactName} testId="text-customer-name" /><DataRow label="Telephone" value={job.contactPhone} testId="text-customer-phone" /><DataRow label="Email" value={contact?.email} testId="text-customer-email" /><DataRow label="Contact record" value={contact ? `Contact #${contact.id}` : job.contactId ? `Contact #${job.contactId}` : "Not linked"} /></div><div className="rounded-xl border border-border/70 bg-background/25 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} className="text-primary" />Work site</div><DataRow label="Address" value={job.address} testId="text-job-address" /><DataRow label="Service" value={job.serviceType} /><DataRow label="Description" value={job.description} /></div></div>{contact?.address && <div className="mt-4 rounded-lg border border-border/60 px-4 py-3 text-sm"><span className="text-xs uppercase tracking-wider text-muted-foreground">Customer address</span><p className="mt-1">{contact.address}</p></div>}</div>}
          {activeTab === "schedule" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Plan the visit" title="Appointments & schedule" note="Schedule data currently comes from the job record." /><div className="grid gap-4 md:grid-cols-[1fr_1fr]"><div className="rounded-xl border border-primary/20 bg-primary/[.06] p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><CalendarDays size={15} />Scheduled visit</div><p className="workspace-title mt-4 text-2xl font-semibold">{dateLabel(job.scheduledAt, "EEEE, d MMMM yyyy")}</p><p className="mt-1 text-sm text-muted-foreground">{dateLabel(job.scheduledAt, "HH:mm")}</p></div><div className="rounded-xl border border-border/70 bg-background/25 p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Clock3 size={15} />Estimated duration</div><p className="workspace-title mt-4 text-2xl font-semibold">{job.estimatedDuration ? `${job.estimatedDuration} minutes` : "Not estimated"}</p><p className="mt-1 text-sm text-muted-foreground">No separate appointment history is available.</p></div></div><div className="mt-5"><EmptyState title="Appointment history is not available" detail="Only the current scheduled date and estimated duration are available in the job record. No separate appointment history can be shown." /></div><Link href="/jobs" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary" data-testid="link-edit-schedule">Manage schedule from Jobs <ArrowUpRight size={14} /></Link></div>}
          {activeTab === "quotes" && <CollectionPanel eyebrow="Estimate & scope" title="Linked quotes" loading={quotesLoading} error={quotesError} onRetry={() => refetchQuotes()} emptyTitle="No quote linked" emptyDetail="There are no quotes attached to this job yet. Link a saved quote from the job edit form." link="Open quotes" href="/quotes">{quotes.map((quote) => <div key={quote.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/25 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-job-quote-${quote.id}`}><div><p className="font-semibold">{quote.title}</p><p className="mt-1 text-xs text-muted-foreground">Quote #{quote.id} · {quote.materials.length} line items · {dateLabel(quote.createdAt, "d MMM yyyy")}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="font-mono text-sm font-semibold text-primary">{formatCurrency(quote.totalIncVat ?? quote.grandTotal)}</span><Link href="/quotes" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid={`link-open-quote-${quote.id}`}>View<ArrowUpRight size={13} /></Link></div></div>)}</CollectionPanel>}
          {activeTab === "purchase-orders" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Procurement" title="Purchase orders" note="Supplier commitments for this job." /><EmptyState title="Purchase orders are not available yet" detail="CREWON does not currently have a purchase-order record or job-to-order linkage. No orders are being shown or implied." /></div>}
          {activeTab === "invoices" && <CollectionPanel eyebrow="Billing" title="Invoices" loading={invoicesLoading} error={invoicesError} onRetry={() => refetchInvoices()} emptyTitle="No invoices recorded" emptyDetail="No invoices are linked to this job. Create or link an invoice in the invoices workspace." link="Open invoices" href="/invoices">{invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/25 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-job-invoice-${invoice.id}`}><div><p className="font-semibold">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-muted-foreground">{invoice.clientName || job.contactName} · Due {dateLabel(invoice.dueDate, "d MMM yyyy")}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="font-mono text-sm font-semibold text-primary">{formatCurrency(invoice.total)}</span><Badge variant="outline" className="capitalize">{invoice.status}</Badge></div></div>)}</CollectionPanel>}
          {activeTab === "certificates" && <CollectionPanel eyebrow="Compliance & handover" title="Certificates" loading={certificatesLoading} error={certificatesError} emptyTitle="No certificates linked" emptyDetail="No saved certificates match this job ID." link="Open certificates" href="/certificates">{jobCertificates.map((certificate) => <div key={certificate.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/25 p-4" data-testid={`row-job-certificate-${certificate.id}`}><div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><FileCheck2 size={17} /></span><div><p className="font-semibold">{certificate.title}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{certificate.type.replaceAll("_", " ")} · Created {dateLabel(certificate.createdAt, "d MMM yyyy")}</p></div></div><Link href="/certificates" className="text-xs font-semibold text-primary" data-testid={`link-certificate-${certificate.id}`}>Open</Link></div>)}</CollectionPanel>}
          {activeTab === "documents" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Site evidence" title="Photos & documents" note="Files kept with the job record." /><EmptyState title="No job file storage available" detail="There is no job-file entity or upload endpoint in CREWON yet. Photos and documents cannot be saved to this job." /></div>}
          {activeTab === "notes" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading eyebrow="Working record" title="Job notes" note="Notes are saved to the job record." />{!editingNotes && <Button variant="outline" size="sm" onClick={() => { setNotesDraft(job.notes ?? ""); setEditingNotes(true); }} className="gap-2" data-testid="button-edit-notes"><Pencil size={14} />Edit notes</Button>}</div>{editingNotes ? <div className="space-y-3"><Textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} rows={7} placeholder="Add practical details for the office and field team…" data-testid="input-job-notes" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingNotes(false)} data-testid="button-cancel-notes"><X size={14} className="mr-1" />Cancel</Button><Button onClick={saveNotes} disabled={updateJob.isPending} data-testid="button-save-notes"><Save size={14} className="mr-2" />{updateJob.isPending ? "Saving…" : "Save notes"}</Button></div></div> : job.notes ? <div className="whitespace-pre-wrap rounded-xl border border-border/70 bg-background/25 p-5 text-sm leading-7" data-testid="text-job-notes">{job.notes}</div> : <EmptyState title="No notes added" detail="Keep access information, agreed scope details or site observations here for the team." />}{!job.notes && !editingNotes && <Button variant="outline" className="mt-4" onClick={() => { setNotesDraft(""); setEditingNotes(true); }} data-testid="button-add-notes">Add the first note</Button>}</div>}
          {activeTab === "communications" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Customer contact" title="Communications" note="Call records and email threads related by available customer/job links." /><div className="mb-6 flex flex-wrap gap-2"><Link href="/calls" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40" data-testid="link-job-calls"><Phone size={14} />Calls workspace</Link><Link href="/email-inbox" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40" data-testid="link-job-email"><Mail size={14} />Email inbox</Link></div>{callsLoading || threadsLoading ? <RowsSkeleton /> : callsError || threadsError ? <EmptyState title="Communication records could not load" detail="Try again from the related Calls or Email Inbox workspace." /> : calls.length === 0 && emails.length === 0 ? <EmptyState title="No related communications found" detail={job.contactId ? "No calls reference this job and no email threads match its linked contact." : "No calls reference this job. Email matching needs a linked customer contact, which this record does not have."} /> : <div className="space-y-3">{calls.map((call) => <div key={`call-${call.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/25 p-4" data-testid={`row-job-call-${call.id}`}><div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Phone size={16} /></span><div><p className="font-semibold">{call.callerName}</p><p className="mt-1 text-xs text-muted-foreground">{call.outcome} · {dateLabel(call.createdAt, "d MMM yyyy, HH:mm")}</p></div></div><Link href={`/calls/${call.id}`} className="text-xs font-semibold text-primary" data-testid={`link-open-call-${call.id}`}>Call #{call.id} <ArrowUpRight size={13} className="inline" /></Link></div>)}{emails.map((thread) => <div key={`email-${thread.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/25 p-4" data-testid={`row-job-email-${thread.id}`}><div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Mail size={16} /></span><div><p className="font-semibold">{thread.subject}</p><p className="mt-1 text-xs text-muted-foreground">{thread.fromName} · {dateLabel(thread.createdAt, "d MMM yyyy, HH:mm")}</p></div></div><Link href="/email-inbox" className="text-xs font-semibold text-primary" data-testid={`link-open-email-${thread.id}`}>Inbox <ArrowUpRight size={13} className="inline" /></Link></div>)}</div>}</div>}
          {activeTab === "tasks" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Next actions" title="Tasks" note="The Tasks workspace is available, but tasks are not currently linked to a job." />{tasksLoading ? <RowsSkeleton /> : tasksError ? <EmptyState title="Tasks could not load" detail="Open the Tasks workspace and try again." link="Open tasks" href="/tasks" /> : <><EmptyState title="No job-specific tasks available" detail={`There are ${pendingTaskCount} pending tasks across the workspace, but the task model has no job linkage. They are not shown as belonging to this job.`} link="View all tasks" href="/tasks" /><Link href="/tasks" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" data-testid="link-job-task-workspace"><ClipboardList size={15} />Open Tasks workspace<ArrowUpRight size={14} /></Link></>}</div>}
          {activeTab === "history" && <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow="Record timeline" title="Job history" note="Only the current record's creation timestamp is available here." /><div className="relative ml-2 border-l border-primary/30 pl-6"><span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" /><p className="text-xs font-bold uppercase tracking-wider text-primary">Record created</p><p className="mt-1 text-sm font-medium">{dateLabel(job.createdAt, "d MMMM yyyy · HH:mm")}</p><p className="mt-1 text-xs text-muted-foreground">Job #{job.id} entered CREWON.</p></div><div className="mt-6"><EmptyState title="No immutable audit trail" detail="The current API does not provide an audit-log endpoint or immutable change history. Only the current job values and creation date can be shown." /></div></div>}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-2 py-5 text-[11px] text-muted-foreground"><span>Viewing {target} · Job-{String(job.id).padStart(4, "0")}</span><span>Created {dateLabel(job.createdAt, "d MMM yyyy")}</span></footer>
      </div>
    </main>
  );
}

function RowsSkeleton() {
  return <div className="animate-pulse space-y-3"><div className="h-16 rounded-xl bg-muted/60" /><div className="h-16 rounded-xl bg-muted/60" /></div>;
}

function CollectionPanel({ eyebrow, title, loading, error, onRetry, emptyTitle, emptyDetail, link, href, children }: {
  eyebrow: string; title: string; loading: boolean; error: boolean; onRetry?: () => void;
  emptyTitle: string; emptyDetail: string; link?: string; href?: string; children: ReactNode;
}) {
  const isEmpty = !loading && !error && (Array.isArray(children) ? children.length === 0 : !children);
  return <div className="workspace-panel rounded-2xl p-5 sm:p-7"><SectionHeading eyebrow={eyebrow} title={title} />{loading ? <RowsSkeleton /> : error ? <div className="space-y-3"><EmptyState title="Could not load records" detail="The saved records are temporarily unavailable." />{onRetry && <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-collection"><RefreshCw size={14} className="mr-2" />Retry</Button>}</div> : isEmpty ? <EmptyState title={emptyTitle} detail={emptyDetail} link={link} href={href} /> : <div className="space-y-3">{children}</div>}</div>;
}

function Overview({ job, quotes, invoices, certificates, calls, setActiveTab, quotesError, invoicesError }: {
  job: Job;
  quotes: Awaited<ReturnType<typeof import("@workspace/api-client-react").listQuotes>>;
  invoices: Awaited<ReturnType<typeof import("@workspace/api-client-react").listInvoices>>;
  certificates: Awaited<ReturnType<typeof import("@workspace/api-client-react").listCertificates>>;
  calls: Awaited<ReturnType<typeof import("@workspace/api-client-react").listCalls>>;
  setActiveTab: (tab: WorkspaceTab) => void;
  quotesError: boolean; invoicesError: boolean;
}) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,.8fr)]">
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => setActiveTab("schedule")} className="workspace-panel rounded-xl p-4 text-left transition-colors hover:border-primary/40" data-testid="summary-schedule"><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><CalendarDays size={14} className="text-primary" />Next visit</span><span className="mt-3 block text-sm font-semibold">{dateLabel(job.scheduledAt, "d MMM · HH:mm")}</span></button>
        <button type="button" onClick={() => setActiveTab("quotes")} className="workspace-panel rounded-xl p-4 text-left transition-colors hover:border-primary/40" data-testid="summary-quote"><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><FileText size={14} className="text-primary" />Quotes</span><span className="mt-3 block text-sm font-semibold">{quotesError ? "Unavailable" : `${quotes.length} linked`}</span></button>
        <button type="button" onClick={() => setActiveTab("invoices")} className="workspace-panel rounded-xl p-4 text-left transition-colors hover:border-primary/40" data-testid="summary-invoice"><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><ReceiptText size={14} className="text-primary" />Invoices</span><span className="mt-3 block text-sm font-semibold">{invoicesError ? "Unavailable" : `${invoices.length} linked`}</span></button>
      </div>
      <div className="workspace-panel rounded-2xl p-5 sm:p-6">
        <SectionHeading eyebrow="On the job" title="Work summary" note="A quick handover view of what is recorded." />
         <div className="grid gap-x-8 md:grid-cols-2"><DataRow label="Customer" value={job.contactName} testId="overview-customer" /><DataRow label="Telephone" value={job.contactPhone} testId="overview-phone" /><DataRow label="Work type" value={job.serviceType} testId="overview-service" /><DataRow label="Priority" value="Not tracked on this job record" testId="overview-priority" /><DataRow label="Estimate" value={job.estimatedValue ? formatCurrency(Number(job.estimatedValue)) : "Not estimated"} testId="overview-estimate" /><DataRow label="Site address" value={job.address} testId="overview-address" /><DataRow label="Duration" value={job.estimatedDuration ? `${job.estimatedDuration} min` : undefined} testId="overview-duration" /></div>
        {job.description && <div className="mt-4 rounded-xl bg-background/35 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scope description</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{job.description}</p></div>}
      </div>
      <div className="workspace-panel rounded-2xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Paperwork</p><h3 className="workspace-title mt-1 text-xl font-semibold">Saved against this job</h3></div><button type="button" onClick={() => setActiveTab("certificates")} className="text-xs font-semibold text-primary hover:text-primary/80" data-testid="button-view-certificates">View all</button></div>{quotes.length + invoices.length + certificates.length === 0 ? <p className="text-sm text-muted-foreground">No linked quotes, invoices or certificates are available.</p> : <div className="space-y-2">{quotes.slice(0, 2).map((quote) => <button type="button" onClick={() => setActiveTab("quotes")} key={`q${quote.id}`} className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/20 px-3 py-3 text-left hover:border-primary/35" data-testid={`overview-paperwork-quote-${quote.id}`}><span className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-primary" /><span className="truncate text-sm font-medium">{quote.title}</span></span><span className="shrink-0 font-mono text-xs">{formatCurrency(quote.totalIncVat ?? quote.grandTotal)}</span></button>)}{invoices.slice(0, 2).map((invoice) => <button type="button" onClick={() => setActiveTab("invoices")} key={`i${invoice.id}`} className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/20 px-3 py-3 text-left hover:border-primary/35" data-testid={`overview-paperwork-invoice-${invoice.id}`}><span className="flex min-w-0 items-center gap-2"><ReceiptText size={15} className="shrink-0 text-primary" /><span className="truncate text-sm font-medium">{invoice.invoiceNumber}</span></span><span className="shrink-0 font-mono text-xs">{formatCurrency(invoice.total)}</span></button>)}{certificates.slice(0, 1).map((certificate) => <button type="button" onClick={() => setActiveTab("certificates")} key={`c${certificate.id}`} className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/20 px-3 py-3 text-left hover:border-primary/35" data-testid={`overview-paperwork-certificate-${certificate.id}`}><span className="flex min-w-0 items-center gap-2"><ShieldCheck size={15} className="shrink-0 text-primary" /><span className="truncate text-sm font-medium">{certificate.title}</span></span><ChevronRight size={15} className="text-muted-foreground" /></button>)}</div>}</div>
    </div>
    <aside className="space-y-4">
      <div className="workspace-panel rounded-2xl p-5"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Next action</p><h3 className="workspace-title mt-2 text-xl font-semibold">Keep the record current</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{job.notes ? "Review the latest site notes before the visit." : "Add any access instructions or agreed scope details before the team heads out."}</p><button type="button" onClick={() => setActiveTab("notes")} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" data-testid="button-overview-notes"><StickyNote size={15} />Open job notes<ArrowUpRight size={13} /></button><div className="mt-5 border-t border-border/70 pt-4"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Assigned engineer</span><span className="font-medium text-muted-foreground">Not available</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Engineer assignment is not a field on the current job record.</p></div></div>
      <div className="workspace-panel rounded-2xl p-5"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Activity links</p><h3 className="workspace-title mt-2 text-xl font-semibold">Related activity</h3><div className="mt-4 space-y-1"><button type="button" onClick={() => setActiveTab("communications")} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-white/[.03]" data-testid="button-activity-calls"><span className="flex items-center gap-2 text-muted-foreground"><Phone size={15} />Related calls</span><span className="font-mono text-xs">{calls.length}</span></button><button type="button" onClick={() => setActiveTab("certificates")} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-white/[.03]" data-testid="button-activity-certificates"><span className="flex items-center gap-2 text-muted-foreground"><ShieldCheck size={15} />Certificates</span><span className="font-mono text-xs">{certificates.length}</span></button><button type="button" onClick={() => setActiveTab("history")} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-white/[.03]" data-testid="button-activity-history"><span className="flex items-center gap-2 text-muted-foreground"><History size={15} />Record history</span><ChevronRight size={14} className="text-muted-foreground" /></button></div></div>
      <div className="rounded-2xl border border-primary/15 bg-primary/[.045] p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Wrench size={14} />Job value</div><p className="workspace-title mt-2 text-3xl font-semibold">{job.estimatedValue ? formatCurrency(Number(job.estimatedValue)) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Current job estimate · not a final invoice total</p></div>
    </aside>
  </div>;
}

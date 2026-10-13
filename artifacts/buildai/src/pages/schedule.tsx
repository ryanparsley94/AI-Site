import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addDays, addMonths, addWeeks, endOfDay, endOfMonth, endOfWeek, format, isSameDay, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { useListJobs } from "@workspace/api-client-react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewMode = "day" | "week" | "month";
const statusLabel = (status: string) => status.replaceAll("_", " ");

export default function Schedule() {
  const { data: jobs = [], isLoading, isError, refetch } = useListJobs();
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const range = useMemo(() => {
    if (mode === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
    if (mode === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) };
  }, [anchor, mode]);
  const visible = jobs.filter((job) => {
    const time = new Date(job.scheduledAt);
    return time >= range.from && time <= range.to && job.status !== "cancelled";
  }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const move = (direction: -1 | 1) => setAnchor((current) =>
    mode === "day" ? addDays(current, direction) : mode === "month" ? addMonths(current, direction) : addWeeks(current, direction)
  );

  return <main className="min-h-full bg-background px-4 py-6 sm:px-6 lg:px-8" data-testid="page-schedule">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Dispatch</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Appointments and jobs from the same job records shown on Home.</p></div>
        <Link href="/jobs"><Button size="sm" data-testid="button-manage-jobs">Manage jobs</Button></Link>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous period" onClick={() => move(-1)}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Next period" onClick={() => move(1)}><ChevronRight size={16} /></Button>
          <span className="ml-1 text-sm font-medium">{mode === "day" ? format(anchor, "EEEE d MMMM yyyy") : mode === "month" ? format(anchor, "MMMM yyyy") : `${format(range.from, "d MMM")} – ${format(range.to, "d MMM yyyy")}`}</span>
        </div>
        <div className="flex rounded-sm border border-border p-1" role="group" aria-label="Schedule view">
          {(["day", "week", "month"] as const).map((view) => <button key={view} onClick={() => setMode(view)} aria-pressed={mode === view}
            className={`px-3 py-1.5 text-xs font-medium capitalize ${mode === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`button-view-${view}`}>{view}</button>)}
        </div>
      </div>
      <section className="mt-5 overflow-hidden border border-border bg-card" aria-label={`${mode} appointments`}>
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading schedule…</p> : isError ? <div className="p-6 text-sm text-muted-foreground">Schedule could not be loaded. <button className="text-primary underline" onClick={() => void refetch()}>Retry</button></div> :
          visible.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto mb-2 text-muted-foreground" size={22} /><p className="text-sm font-medium">No jobs in this {mode}</p><p className="mt-1 text-xs text-muted-foreground">Create or reschedule a job to see it here.</p><Link className="mt-3 inline-block text-xs text-primary underline" href="/jobs">Open jobs</Link></div> :
          <div className="divide-y divide-border">{visible.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} data-testid={`schedule-job-${job.id}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:grid-cols-[100px_1fr_auto] sm:items-center">
            <div className="font-mono text-sm tabular-nums text-primary">{format(new Date(job.scheduledAt), "EEE d MMM")}<span className="block text-xs text-muted-foreground">{format(new Date(job.scheduledAt), "HH:mm")}</span></div>
            <div className="min-w-0"><div className="flex items-center gap-2"><Wrench size={14} className="text-primary" /><span className="truncate text-sm font-semibold">{job.title}</span><span className="rounded-sm bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">{statusLabel(job.status)}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{job.contactName} · {job.serviceType}</p>
              <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin size={12} />{job.address || "Site address not recorded"}</p></div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound size={13} />Not assigned</span>
          </Link>)}</div>}
      </section>
    </div>
  </main>;
}

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { useListJobs } from "@workspace/api-client-react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewMode = "day" | "week" | "month";
const statusLabel = (status: string) => status.replaceAll("_", " ");

export default function Schedule() {
  const { data: jobs = [], isLoading, isError, refetch } = useListJobs();
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const range = useMemo(() => mode === "day"
    ? { from: startOfDay(anchor), to: endOfDay(anchor) }
    : mode === "month"
      ? { from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }) }
      : { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) }, [anchor, mode]);
  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: range.to }), [range]);
  const visible = jobs.filter((job) => {
    const time = new Date(job.scheduledAt);
    return time >= range.from && time <= range.to && job.status !== "cancelled";
  }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const jobsForDay = (day: Date) => visible.filter((job) => isSameDay(new Date(job.scheduledAt), day));
  const move = (direction: -1 | 1) => setAnchor((current) =>
    mode === "day" ? addDays(current, direction) : mode === "month" ? addMonths(current, direction) : addWeeks(current, direction)
  );
  const periodLabel = mode === "day" ? format(anchor, "EEEE d MMMM yyyy") :
    mode === "month" ? format(anchor, "MMMM yyyy") :
      `${format(range.from, "d MMM")} – ${format(range.to, "d MMM yyyy")}`;

  const JobEvent = ({ job, compact = false }: { job: typeof jobs[number]; compact?: boolean }) => (
    <Link href={`/jobs/${job.id}`} data-testid={`schedule-job-${job.id}`} className={`block border-l-2 border-primary bg-muted/40 px-2 py-1.5 hover:bg-muted ${compact ? "text-[10px]" : "text-xs"}`}>
      <span className="block font-mono text-primary">{format(new Date(job.scheduledAt), "HH:mm")}</span>
      <span className="mt-0.5 block truncate font-semibold">{job.title}</span>
      {!compact && <span className="mt-0.5 block truncate text-muted-foreground">{job.contactName} · {job.serviceType}</span>}
      <span className="mt-0.5 block truncate text-muted-foreground">{job.assignedEngineer || "Unassigned"} · {job.address || "Site address missing"}</span>
    </Link>
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
           <span className="ml-1 text-sm font-medium">{periodLabel}</span>
        </div>
        <div className="flex rounded-sm border border-border p-1" role="group" aria-label="Schedule view">
          {(["day", "week", "month"] as const).map((view) => <button key={view} onClick={() => setMode(view)} aria-pressed={mode === view}
            className={`px-3 py-1.5 text-xs font-medium capitalize ${mode === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`button-view-${view}`}>{view}</button>)}
        </div>
      </div>
      <section className="mt-5 overflow-hidden border border-border bg-card" aria-label={`${mode} job calendar`}>
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading schedule…</p> : isError ? <div className="p-6 text-sm text-muted-foreground">Schedule could not be loaded. <button className="text-primary underline" onClick={() => void refetch()}>Retry</button></div> :
          mode === "day" ? (
            <div className="divide-y divide-border">
              {jobsForDay(anchor).length ? jobsForDay(anchor).map((job) => <div key={job.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[110px_1fr]"><div className="font-mono text-sm text-primary">{format(new Date(job.scheduledAt), "HH:mm")}<span className="block font-sans text-xs text-muted-foreground">{job.estimatedDuration || 60} min</span></div><div className="grid gap-2 sm:grid-cols-[1fr_160px]"><JobEvent job={job} /><div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} />{job.address || "Site address missing"}</div></div></div>) : <EmptySchedule mode={mode} />}
            </div>
          ) : mode === "week" ? (
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
              {days.map((day) => <div key={day.toISOString()} className="min-h-40 p-2">
                <div className={`mb-2 flex items-center justify-between text-xs ${isToday(day) ? "font-bold text-primary" : "text-muted-foreground"}`}><span>{format(day, "EEE")}</span><span>{format(day, "d MMM")}</span></div>
                <div className="space-y-1">{jobsForDay(day).map((job) => <JobEvent key={job.id} job={job} />)}</div>
                {jobsForDay(day).length === 0 && <p className="pt-2 text-[10px] text-muted-foreground">No jobs</p>}
              </div>)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 border-b border-border">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}</div>
                <div className="grid grid-cols-7">{days.map((day) => <div key={day.toISOString()} className={`min-h-28 border-b border-r border-border p-1.5 ${isSameMonth(day, anchor) ? "" : "bg-muted/20"}`}><div className={`mb-1 text-xs ${isToday(day) ? "font-bold text-primary" : isSameMonth(day, anchor) ? "text-foreground" : "text-muted-foreground/60"}`}>{format(day, "d")}</div><div className="space-y-1">{jobsForDay(day).slice(0, 3).map((job) => <JobEvent key={job.id} job={job} compact />)}{jobsForDay(day).length > 3 && <p className="text-[10px] text-muted-foreground">+{jobsForDay(day).length - 3} more</p>}</div></div>)}</div>
              </div>
            </div>
          )}
      </section>
    </div>
  </main>;
}

function EmptySchedule({ mode }: { mode: ViewMode }) {
  return <div className="p-10 text-center"><CalendarDays className="mx-auto mb-2 text-muted-foreground" size={22} /><p className="text-sm font-medium">No jobs in this {mode}</p><p className="mt-1 text-xs text-muted-foreground">Create or reschedule a job to see it here.</p><Link className="mt-3 inline-block text-xs text-primary underline" href="/jobs">Open jobs</Link></div>;
}

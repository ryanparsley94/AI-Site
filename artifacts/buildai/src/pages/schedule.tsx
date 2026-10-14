import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { useListJobs, type Job } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, MapPin, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventGeometry, layoutOverlaps, minuteOffset } from "@/lib/schedule-layout";

type ViewMode = "day" | "week" | "month";
const HOUR_HEIGHT = 60;
const DAY_MINUTES = 24 * 60;
const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Schedule() {
  const { data: jobs = [], isLoading, isError, refetch } = useListJobs();
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [engineer, setEngineer] = useState("all");

  const range = useMemo(() => mode === "day"
    ? { from: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), to: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59, 999) }
    : mode === "month"
      ? { from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }) }
      : { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) }, [anchor, mode]);
  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: range.to }), [range]);
  const engineers = [...new Set(jobs.map((job) => job.assignedEngineer?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const matchingEngineer = (job: Job) => engineer === "all" || (engineer === "unassigned" ? !job.assignedEngineer?.trim() : job.assignedEngineer?.trim() === engineer);
  const visibleJobs = jobs.filter((job) => job.status !== "cancelled" && matchingEngineer(job));
  const pendingJobs = visibleJobs.filter((job) => job.status === "pending_confirmation");
  const calendarJobs = visibleJobs.filter((job) => job.status !== "pending_confirmation");
  const jobsForDay = (day: Date) => calendarJobs.filter((job) => isSameDay(new Date(job.scheduledAt), day)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const move = (direction: -1 | 1) => {
    if (mode === "day") {
      const next = addDays(anchor, direction);
      setAnchor(next); setSelectedDay(next);
    } else if (mode === "month") {
      const next = addMonths(anchor, direction);
      setAnchor(next); setSelectedDay(startOfMonth(next));
    } else {
      const next = addWeeks(anchor, direction);
      setAnchor(next); setSelectedDay(next);
    }
  };
  const today = () => { const now = new Date(); setAnchor(now); setSelectedDay(now); };
  const periodLabel = mode === "day" ? format(anchor, "EEEE d MMMM yyyy")
    : mode === "month" ? format(anchor, "MMMM yyyy")
      : `${format(range.from, "d MMM")} – ${format(range.to, "d MMM yyyy")}`;
  const monthCells = days;

  return <main className="min-h-full bg-background px-4 py-5 pb-32 sm:px-6 sm:py-6 lg:px-8" data-testid="page-schedule">
    <div className="mx-auto max-w-[1500px]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4 sm:pb-5">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Dispatch</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Scheduler</h1><p className="mt-1 text-sm text-muted-foreground">Appointments from the same job records shown on Home.</p></div>
        <Link href="/jobs?create=1"><Button className="min-h-11 gap-2 px-4" data-testid="button-add-scheduled-job"><Plus size={17} /> Add job</Button></Link>
      </header>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11 w-11" aria-label="Previous period" onClick={() => move(-1)}><ChevronLeft size={19} /></Button>
          <Button variant="outline" className="min-h-11 px-4" onClick={today} data-testid="button-schedule-today">Today</Button>
          <Button variant="outline" className="h-11 w-11" aria-label="Next period" onClick={() => move(1)}><ChevronRight size={19} /></Button>
          <span className="ml-1 min-w-0 text-sm font-semibold sm:text-base" data-testid="schedule-period">{periodLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
            <UserRound size={16} className="text-primary" />
            <span className="sr-only">Filter by assigned engineer</span>
            <select aria-label="Filter by assigned engineer" value={engineer} onChange={(event) => setEngineer(event.target.value)} className="min-h-10 max-w-[190px] bg-transparent text-foreground outline-none">
              <option value="all">All engineers</option><option value="unassigned">Unassigned</option>
              {engineers.map((name) => <option value={name} key={name}>{name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1" role="group" aria-label="Calendar view">
            {(["day", "week", "month"] as const).map((view) => <button key={view} onClick={() => setMode(view)} aria-pressed={mode === view} data-testid={`button-view-${view}`} className={`min-h-10 min-w-[58px] rounded-md px-3 text-sm font-semibold capitalize ${mode === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{view}</button>)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label={`${mode} job calendar`}>
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading schedule…</p>
            : isError ? <div className="p-6 text-sm text-muted-foreground">Schedule could not be loaded. <button className="min-h-11 text-primary underline" onClick={() => void refetch()}>Retry</button></div>
              : mode === "day" ? <Timeline day={anchor} jobs={jobsForDay(anchor)} />
                : mode === "week" ? <WeekTimeline days={days} jobsForDay={jobsForDay} />
                  : <MonthCalendar anchor={anchor} days={monthCells} jobsForDay={jobsForDay} selectedDay={selectedDay} onSelectDay={setSelectedDay} />}
        </section>

        <aside className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Unscheduled and pending jobs">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-base font-semibold">Needs scheduling</h2><p className="mt-1 text-sm text-muted-foreground">Pending confirmation or unscheduled</p></div>
            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-sm font-bold tabular-nums text-amber-200">{pendingJobs.length}</span>
          </div>
          {pendingJobs.length ? <div className="mt-4 space-y-2">{pendingJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="block min-h-16 rounded-lg border border-border bg-background p-3 hover:border-primary/50">
            <span className="block break-words text-sm font-semibold">{job.title}</span><span className="mt-1 block text-xs text-muted-foreground">{job.contactName} · {job.assignedEngineer || "Unassigned"}</span>
            <span className="mt-1 block text-xs text-amber-200">{job.status === "pending_confirmation" ? "Pending confirmation" : "Needs scheduling"}</span>
          </Link>)}</div>
            : <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">No jobs are waiting for confirmation or scheduling.</div>}
          <Link href="/jobs?create=1" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15"><Plus size={17} /> Add a job</Link>
        </aside>
      </div>
    </div>
  </main>;
}

function Timeline({ day, jobs }: { day: Date; jobs: Job[] }) {
  const lanes = layoutOverlaps(jobs.map((job) => {
    const start = minuteOffset(new Date(job.scheduledAt));
    return { id: job.id, startMinute: start, endMinute: start + Math.max(15, job.estimatedDuration || 60) };
  }));
  const height = DAY_MINUTES / 60 * HOUR_HEIGHT;
  return <div data-testid="day-timeline">
    <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 text-sm font-semibold">{format(day, "EEEE d MMMM")} · {jobs.length} {jobs.length === 1 ? "appointment" : "appointments"}</div>
    <div className="relative overflow-y-auto" style={{ maxHeight: "min(72vh, 760px)"}}>
      <div className="relative flex" style={{ height }}>
        <TimeLabels />
        <TimelineTrack jobs={jobs} lanes={lanes} testPrefix="day-event" />
      </div>
    </div>
    {!jobs.length && <p className="border-t border-border p-4 text-sm text-muted-foreground">No scheduled jobs for this day.</p>}
  </div>;
}

function WeekTimeline({ days, jobsForDay }: { days: Date[]; jobsForDay: (day: Date) => Job[] }) {
  return <div data-testid="week-timeline" className="overflow-x-auto">
    <div className="min-w-[1320px]">
      <div className="sticky top-0 z-20 grid grid-cols-[60px_repeat(7,minmax(180px,1fr))] border-b border-border bg-card">
        <div className="border-r border-border p-2 text-[10px] text-muted-foreground">Local time</div>
        {days.map((day) => <div key={day.toISOString()} className={`border-r border-border px-2 py-3 text-center ${isToday(day) ? "bg-primary/10 text-primary" : ""}`}><span className="block text-xs font-semibold">{format(day, "EEE")}</span><span className="mt-0.5 block text-sm font-bold">{format(day, "d MMM")}</span><span className="text-[10px] text-muted-foreground">{jobsForDay(day).length} jobs</span></div>)}
      </div>
      <div className="grid grid-cols-[60px_repeat(7,minmax(180px,1fr))]">
        <TimeLabels />
        {days.map((day) => {
          const jobs = jobsForDay(day);
          const lanes = layoutOverlaps(jobs.map((job) => { const start = minuteOffset(new Date(job.scheduledAt)); return { id: job.id, startMinute: start, endMinute: start + Math.max(15, job.estimatedDuration || 60) }; }));
          return <TimelineTrack key={day.toISOString()} jobs={jobs} lanes={lanes} testPrefix={`week-event-${format(day, "yyyy-MM-dd")}`} />;
        })}
      </div>
    </div>
  </div>;
}

function TimeLabels() {
  return <div className="relative z-10 w-[60px] shrink-0 border-r border-border bg-card" aria-hidden="true">
    {HOUR_LABELS.map((hour) => <div key={hour} className="relative border-b border-border/70 pr-2 text-right text-[10px] text-muted-foreground" style={{ height: HOUR_HEIGHT }}>
      <span className="absolute right-2 top-0 -translate-y-1/2">{hour === 0 ? "12 am" : hour < 12 ? `${hour} am` : hour === 12 ? "12 pm" : `${hour - 12} pm`}</span>
    </div>)}
  </div>;
}

function TimelineTrack({ jobs, lanes, testPrefix }: { jobs: Job[]; lanes: Map<number, { lane: number; laneCount: number }>; testPrefix: string }) {
  return <div className="relative min-w-0 flex-1" style={{ height: DAY_MINUTES / 60 * HOUR_HEIGHT }}>
    {HOUR_LABELS.map((hour) => <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }} />)}
    {jobs.map((job) => {
      const start = minuteOffset(new Date(job.scheduledAt));
      const duration = Math.max(15, job.estimatedDuration || 60);
      const geometry = eventGeometry(start, duration, HOUR_HEIGHT);
      const lane = lanes.get(job.id) ?? { lane: 0, laneCount: 1 };
      const statusClass = job.status === "in_progress" ? "border-blue-400 bg-blue-400/15" : job.status === "completed" ? "border-emerald-400 bg-emerald-400/10" : "border-primary bg-primary/15";
      return <Link key={job.id} href={`/jobs/${job.id}`} data-testid={`${testPrefix}-${job.id}`} data-start-minute={start} data-duration-minutes={duration} data-overlap-lane={lane.lane} data-overlap-lanes={lane.laneCount} aria-label={`${format(new Date(job.scheduledAt), "HH:mm")}, ${job.title}, ${job.estimatedDuration || 60} minutes, ${job.contactName}, ${job.assignedEngineer || "Unassigned"}, ${job.address || "Site address missing"}`}
        className={`absolute z-[1] overflow-hidden rounded-r-md border-l-[3px] px-2 py-1.5 text-xs shadow-sm hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${statusClass}`}
        style={{ top: geometry.top, height: geometry.height, left: `calc(${lane.lane * 100 / lane.laneCount}% + 3px)`, width: `calc(${100 / lane.laneCount}% - 6px)` }}>
        <span className="block font-mono font-bold text-primary">{format(new Date(job.scheduledAt), "HH:mm")} · {job.estimatedDuration || 60} min</span>
        <span className="mt-0.5 block break-words font-semibold leading-tight">{job.title}</span>
        <span className="mt-0.5 block break-words text-muted-foreground">{job.contactName} · {job.assignedEngineer || "Unassigned"}</span>
        {geometry.height > 76 && <span className="mt-0.5 flex items-start gap-1 break-words text-muted-foreground"><MapPin size={11} className="mt-0.5 shrink-0" />{job.address || "Site address missing"}</span>}
      </Link>;
    })}
  </div>;
}

function MonthCalendar({ anchor, days, jobsForDay, selectedDay, onSelectDay }: { anchor: Date; days: Date[]; jobsForDay: (day: Date) => Job[]; selectedDay: Date; onSelectDay: (day: Date) => void }) {
  const agendaJobs = jobsForDay(selectedDay);
  return <div data-testid="month-calendar">
    <div className="grid grid-cols-7 border-b border-border bg-muted/20">{WEEKDAYS.map((day) => <div key={day} className="py-2 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs">{day}</div>)}</div>
    <div className="grid grid-cols-7">
      {days.map((day) => {
        const dayJobs = jobsForDay(day);
        const selected = isSameDay(day, selectedDay);
        return <button key={day.toISOString()} type="button" onClick={() => onSelectDay(day)} aria-pressed={selected} aria-label={`${format(day, "EEEE d MMMM")}, ${dayJobs.length} jobs`} data-testid={`month-day-${format(day, "yyyy-MM-dd")}`}
          className={`min-h-[74px] border-b border-r border-border p-1.5 text-left transition-colors sm:min-h-24 sm:p-2 ${!isSameMonth(day, anchor) ? "bg-muted/10 text-muted-foreground/60" : ""} ${selected ? "bg-primary/10 ring-1 ring-inset ring-primary" : "hover:bg-muted/40"} ${isToday(day) ? "font-bold text-primary" : ""}`}>
          <span className="block text-xs sm:text-sm">{format(day, "d")}</span>
          <span className="mt-1 flex flex-wrap gap-1" aria-hidden="true">{dayJobs.slice(0, 4).map((job) => <i key={job.id} className="h-1.5 w-1.5 rounded-full bg-primary" />)}{dayJobs.length > 4 && <small className="text-[9px]">+{dayJobs.length - 4}</small>}</span>
          <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">{dayJobs.length ? `${dayJobs.length} jobs` : "—"}</span>
        </button>;
      })}
    </div>
    <section className="border-t border-border p-4 sm:p-5" aria-label="Selected day agenda">
      <h2 className="mb-3 text-base font-semibold">{format(selectedDay, "EEEE d MMMM")} · {agendaJobs.length} {agendaJobs.length === 1 ? "job" : "jobs"}</h2>
      {agendaJobs.length ? <div className="divide-y divide-border rounded-lg border border-border">{agendaJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} data-testid={`month-agenda-job-${job.id}`} className="flex min-h-16 items-center justify-between gap-3 px-3 py-3 hover:bg-muted/40">
        <span className="min-w-0"><span className="block break-words text-sm font-semibold">{job.title}</span><span className="mt-1 block text-xs text-muted-foreground">{job.contactName} · {job.assignedEngineer || "Unassigned"}</span></span>
        <span className="shrink-0 text-right text-xs font-semibold"><span className="block font-mono text-primary">{format(new Date(job.scheduledAt), "HH:mm")}</span><span className="text-muted-foreground">{job.estimatedDuration || 60} min</span></span>
      </Link>)}</div> : <p className="rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">No jobs scheduled for this day. Choose another date or add a job.</p>}
    </section>
  </div>;
}

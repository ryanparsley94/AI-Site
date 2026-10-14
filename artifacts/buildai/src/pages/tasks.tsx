import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useGenerateTasks,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import type { Task, TaskPriority } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Sparkles,
  CheckCircle2,
  Circle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ClipboardList,
  FileText,
  Receipt,
  ShieldCheck,
  ListTodo,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { overdueDays, sortTasks, taskDueDate } from "@/lib/task-dates";
import { useLocalDay } from "@/hooks/use-local-day";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const TASK_SECTIONS = [
  { id: "quotes", label: "Quotes", icon: FileText, path: "/quotes", color: "border-cyan-500/35 bg-cyan-500/5 text-cyan-800 dark:text-cyan-200", dot: "bg-cyan-500" },
  { id: "invoices", label: "Invoices", icon: Receipt, path: "/invoices", color: "border-blue-500/35 bg-blue-500/5 text-blue-800 dark:text-blue-200", dot: "bg-blue-500" },
  { id: "certificates", label: "Certificates", icon: ShieldCheck, path: "/certificates", color: "border-amber-500/35 bg-amber-500/5 text-amber-900 dark:text-amber-200", dot: "bg-amber-500" },
  { id: "todo", label: "To-do List", icon: ListTodo, path: "/tasks", color: "border-slate-500/30 bg-slate-500/5 text-foreground", dot: "bg-slate-500" },
] as const;

type TaskSectionId = typeof TASK_SECTIONS[number]["id"];

function taskSection(task: Task): TaskSectionId {
  const title = task.title.toLowerCase();
  if (/\bquote\b|\bquotation\b/.test(title)) return "quotes";
  if (/\binvoice\b|\binvoicing\b/.test(title)) return "invoices";
  if (/\bcertificate\b|\beicr\b|\bminor works cert\b|\bcompletion cert\b/.test(title)) return "certificates";
  return "todo";
}

function groupedTasks(tasks: Task[]) {
  return Object.fromEntries(
    TASK_SECTIONS.map((section) => [section.id, tasks.filter((task) => taskSection(task) === section.id)]),
  ) as Record<TaskSectionId, Task[]>;
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const today = useLocalDay();

  const { data: tasks = [], isLoading } = useListTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const generateTasks = useGenerateTasks();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const pendingTasks = sortTasks(tasks.filter((t) => t.status === "pending"), today);
  const overdueCount = pendingTasks.filter((task) => overdueDays(task, today) > 0).length;
  const completedTasks = sortTasks(
    tasks.filter((t) => t.status === "completed" || t.status === "dismissed"), today
  );
  const pendingBySection = groupedTasks(pendingTasks);
  const completedBySection = groupedTasks(completedTasks);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      await createTask.mutateAsync({ data: { title, priority: "medium", source: "manual" } });
      await invalidate();
    } catch {
      toast({ title: "Failed to add task", variant: "destructive" });
    }
  };

  const handleToggle = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await updateTask.mutateAsync({ id: task.id, data: { status: newStatus } });
      await invalidate();
    } catch {
      toast({ title: "Failed to update task", variant: "destructive" });
    }
  };

  const handleDismiss = async (task: Task) => {
    try {
      await updateTask.mutateAsync({ id: task.id, data: { status: "dismissed" } });
      await invalidate();
    } catch {
      toast({ title: "Failed to dismiss task", variant: "destructive" });
    }
  };

  const handleDelete = async (task: Task) => {
    try {
      await deleteTask.mutateAsync({ id: task.id });
      await invalidate();
    } catch {
      toast({ title: "Failed to delete task", variant: "destructive" });
    }
  };

  const handleCyclePriority = async (task: Task) => {
    const order: TaskPriority[] = ["high", "medium", "low"];
    const next = order[(order.indexOf(task.priority) + 1) % order.length];
    try {
      await updateTask.mutateAsync({ id: task.id, data: { priority: next } });
      await invalidate();
    } catch {
      toast({ title: "Failed to update priority", variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    try {
      const newTasks = await generateTasks.mutateAsync();
      await invalidate();
      toast({
        title: `${newTasks.length} tasks generated`,
        description: "Your AI-generated to-do list is ready.",
      });
    } catch {
      toast({ title: "Failed to generate tasks", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 pb-32 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {pendingTasks.length} pending task{pendingTasks.length !== 1 ? "s" : ""}
              {overdueCount > 0 && ` · ${overdueCount} overdue`}
            </p>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generateTasks.isPending}
          className="min-h-11 gap-2 px-3"
        >
          {generateTasks.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {generateTasks.isPending ? "Generating…" : "AI Generate Tasks"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tasks are grouped by what their wording refers to; general actions stay in To-do List. Completing an invoice task does not mark its invoice paid.
      </p>

      {/* Add task input */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="min-h-11 flex-1"
        />
        <Button
          variant="outline"
          onClick={handleAdd}
          disabled={!newTitle.trim() || createTask.isPending}
          className="min-h-11 gap-1 px-4"
        >
          <Plus size={16} />
          Add
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tasks.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <ClipboardList size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No tasks yet</p>
          <p className="text-sm text-muted-foreground/70">
            Click <strong>AI Generate Tasks</strong> to create a smart to-do list from your calls,
            emails, and jobs — or add tasks manually above.
          </p>
        </div>
      )}

      {!isLoading && overdueCount > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Unfinished tasks from previous days are carried forward below, overdue tasks first.
        </p>
      )}

      {/* Pending tasks stay as task records; invoice payment state never changes task completion. */}
      {!isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {TASK_SECTIONS.map((section) => {
            const Icon = section.icon;
            const sectionTasks = pendingBySection[section.id];
            const sectionOverdue = sectionTasks.filter((task) => overdueDays(task, today) > 0).length;
            return (
              <section key={section.id} data-testid={`task-section-${section.id}`} className={cn("min-w-0 rounded-xl border p-4 sm:p-5", section.color)}>
                <header className="mb-3 flex items-center justify-between gap-3 border-b border-current/10 pb-3">
                  <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", section.dot)} />
                    <Icon size={17} aria-hidden="true" />
                    {section.label}
                  </h2>
                  <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold tabular-nums" aria-label={`${sectionTasks.length} pending, ${sectionOverdue} overdue`}>
                    {sectionTasks.length} pending{sectionOverdue ? ` · ${sectionOverdue} overdue` : ""}
                  </span>
                </header>
                {sectionTasks.length ? (
                  <div className="space-y-2">
                    {sectionTasks.map((task) => (
                      <TaskRow key={task.id} task={task} today={today} openPath={section.path}
                        onToggle={handleToggle} onDismiss={handleDismiss} onDelete={handleDelete}
                        onCyclePriority={handleCyclePriority} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-current/20 bg-background/35 px-3 py-5 text-sm text-muted-foreground">
                    No pending {section.label.toLowerCase()} tasks.
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Completed / dismissed tasks toggle */}
      {!isLoading && completedTasks.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {completedTasks.length} completed / dismissed
          </button>

          {showCompleted && (
            <div className="grid gap-4 pt-3 md:grid-cols-2">
              {TASK_SECTIONS.map((section) => {
                const Icon = section.icon;
                const sectionTasks = completedBySection[section.id];
                return (
                  <section key={section.id} className="min-w-0 rounded-xl border bg-card p-3 opacity-70 sm:p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon size={16} />{section.label} · {sectionTasks.length}</h3>
                    {sectionTasks.length ? <div className="space-y-2">{sectionTasks.map((task) => (
                      <TaskRow key={task.id} task={task} today={today} openPath={section.path}
                        onToggle={handleToggle} onDismiss={handleDismiss} onDelete={handleDelete}
                        onCyclePriority={handleCyclePriority} />
                    ))}</div> : <p className="text-sm text-muted-foreground">No completed tasks in this section.</p>}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  today: string;
  onToggle: (t: Task) => void;
  onDismiss: (t: Task) => void;
  onDelete: (t: Task) => void;
  onCyclePriority: (t: Task) => void;
  openPath: string;
}

function TaskRow({ task, today, openPath, onToggle, onDismiss, onDelete, onCyclePriority }: TaskRowProps) {
  const isDone = task.status !== "pending";
  const daysOverdue = overdueDays(task, today);
  const dueDate = taskDueDate(task);
  const jobMatch = task.title.match(/\bjob\s+#?(\d+)\b/i);

  return (
    <div
      data-testid={`task-row-${task.id}`}
      className={cn(
        "flex min-h-[64px] flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border bg-card transition-colors group",
        daysOverdue > 0 && "border-amber-300 bg-amber-50/50",
        isDone && "bg-muted/30"
      )}
    >
      {/* Check button */}
      <button
        onClick={() => onToggle(task)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
        title={isDone ? "Mark pending" : "Mark complete"}
        aria-label={`${isDone ? "Mark pending" : "Mark complete"}: ${task.title}`}
      >
        {isDone ? (
          <CheckCircle2 size={20} className="text-primary" />
        ) : (
          <Circle size={20} />
        )}
      </button>

      {/* Title */}
      <div
        className={cn(
          "min-w-0 flex-1 text-sm leading-snug sm:text-[15px]",
          isDone && "line-through text-muted-foreground"
        )}
      >
        <span>{task.title}</span>
        {taskSection(task) !== "todo" && (
          <Link href={openPath} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" aria-label={`Open ${taskSection(task)} area`}>
            Open {TASK_SECTIONS.find((section) => section.id === taskSection(task))?.label} list <ArrowUpRight size={12} />
          </Link>
        )}
        {jobMatch && (
          <Link href={`/jobs/${jobMatch[1]}`} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" aria-label={`Open job ${jobMatch[1]}`}>
            Open job #{jobMatch[1]} <ArrowUpRight size={12} />
          </Link>
        )}
        {daysOverdue > 0 && (
          <div className="mt-1">
            <Badge variant="outline" className="text-amber-800 bg-amber-100 border-amber-300">
              {daysOverdue === 1 ? "Overdue · from yesterday" : `Overdue · ${daysOverdue} days`}
            </Badge>
          </div>
        )}
      </div>

      {/* Source badge (AI only) */}
      {task.source === "ai" && (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full shrink-0">
          <Sparkles size={10} />
          AI
        </span>
      )}

      {/* Due date */}
      {dueDate && (
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(`${dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}

      {/* Priority badge — click to cycle */}
      <button
        onClick={() => onCyclePriority(task)}
        title="Click to change priority"
        aria-label={`Change priority for ${task.title}; current priority ${task.priority}`}
        className={cn(
          "hidden min-h-10 sm:inline-flex text-xs px-3 py-1 rounded-full border font-medium shrink-0 transition-opacity",
          PRIORITY_COLORS[task.priority],
          isDone && "opacity-50"
        )}
      >
        {task.priority}
      </button>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        {!isDone && (
          <button
            onClick={() => onDismiss(task)}
            className="min-h-10 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            title="Dismiss"
          >
            Dismiss
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title="Delete"
          aria-label={`Delete task: ${task.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

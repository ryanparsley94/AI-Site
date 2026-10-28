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
  ArrowLeft,
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
  const [activeSection, setActiveSection] = useState<TaskSectionId | null>(null);
  const [searchText, setSearchText] = useState("");
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
  const currentSection = TASK_SECTIONS.find((section) => section.id === activeSection);
  const currentPending = activeSection ? pendingBySection[activeSection] : [];
  const currentCompleted = activeSection ? completedBySection[activeSection] : [];
  const visiblePending = currentPending.filter((task) => task.title.toLowerCase().includes(searchText.trim().toLowerCase()));
  const visibleCompleted = currentCompleted.filter((task) => task.title.toLowerCase().includes(searchText.trim().toLowerCase()));

  const openSection = (section: TaskSectionId) => {
    setActiveSection(section);
    setSearchText("");
    setShowCompleted(false);
  };
  const closeSection = () => {
    setActiveSection(null);
    setSearchText("");
    setShowCompleted(false);
  };

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
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 pb-32 sm:space-y-6 sm:p-6">
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

      {/* Category-first navigation: don't render four long lists on the landing view. */}
      {!isLoading && (
        activeSection === null ? (
          <section aria-label="Task categories" className="space-y-3" data-testid="task-categories">
            <div>
              <h2 className="text-lg font-bold text-foreground">What do you need to work on?</h2>
              <p className="text-sm text-muted-foreground">Choose one category to open its tasks.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {TASK_SECTIONS.map((section) => {
                const Icon = section.icon;
                const sectionTasks = pendingBySection[section.id];
                const sectionOverdue = sectionTasks.filter((task) => overdueDays(task, today) > 0).length;
                return (
                  <button
                    type="button"
                    key={section.id}
                    data-testid={`task-section-${section.id}`}
                    aria-label={`Open ${section.label}, ${sectionTasks.length} pending tasks`}
                    onClick={() => openSection(section.id)}
                    className={cn(
                      "group flex min-h-[156px] min-w-0 flex-col justify-between gap-3 rounded-2xl border-2 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-[176px] sm:p-5",
                      section.color
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 shadow-sm">
                        <Icon size={25} aria-hidden="true" />
                      </span>
                      <ArrowUpRight size={23} className="shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                    </span>
                    <span className="space-y-1">
                      <span className="block text-base font-bold leading-tight sm:text-xl">{section.label}</span>
                      <span className="block text-sm font-semibold tabular-nums">
                        {sectionTasks.length} pending{sectionOverdue > 0 ? ` · ${sectionOverdue} overdue` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="space-y-4" data-testid={`task-panel-${activeSection}`} aria-labelledby="active-task-category">
            <button type="button" data-testid="back-to-task-categories" onClick={closeSection}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <ArrowLeft size={19} aria-hidden="true" /> All task categories
            </button>
            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                <h2 id="active-task-category" className="text-xl font-bold sm:text-2xl">{currentSection?.label}</h2>
                <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
                  {currentPending.length} pending
                </span>
              </header>
              <label htmlFor="task-list-search" className="mb-2 mt-4 block text-sm font-semibold text-foreground">
                Search {currentSection?.label.toLowerCase()} tasks
              </label>
              <Input
                id="task-list-search"
                type="search"
                placeholder="Search this task list…"
                className="mb-4 min-h-12"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              {visiblePending.length > 0 ? (
                <div className="space-y-2" data-testid="task-list-pending">
                  {visiblePending.map((task) => (
                    <TaskRow key={task.id} task={task} today={today} openPath={currentSection?.path ?? "/tasks"}
                      onToggle={handleToggle} onDismiss={handleDismiss} onDelete={handleDelete}
                      onCyclePriority={handleCyclePriority} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  {searchText.trim() ? "No tasks match your search." : `No pending ${currentSection?.label.toLowerCase()} tasks.`}
                </p>
              )}
              {currentCompleted.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <button type="button" onClick={() => setShowCompleted((value) => !value)}
                    aria-expanded={showCompleted}
                    className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    {showCompleted ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    {currentCompleted.length} completed / dismissed
                  </button>
                  {showCompleted && (
                    <div className="mt-3 space-y-2" data-testid="task-list-completed">
                      {visibleCompleted.map((task) => (
                        <TaskRow key={task.id} task={task} today={today} openPath={currentSection?.path ?? "/tasks"}
                          onToggle={handleToggle} onDismiss={handleDismiss} onDelete={handleDelete}
                          onCyclePriority={handleCyclePriority} />
                      ))}
                      {visibleCompleted.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No completed tasks match your search.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )
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

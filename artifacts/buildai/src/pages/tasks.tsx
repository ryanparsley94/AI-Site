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
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      // pending first, then completed/dismissed
      if (a.status === "pending") return -1;
      if (b.status === "pending") return 1;
    }
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: tasks = [], isLoading } = useListTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const generateTasks = useGenerateTasks();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const pendingTasks = sortTasks(tasks.filter((t) => t.status === "pending"));
  const completedTasks = sortTasks(
    tasks.filter((t) => t.status === "completed" || t.status === "dismissed")
  );

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
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {pendingTasks.length} pending task{pendingTasks.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generateTasks.isPending}
          className="gap-2"
        >
          {generateTasks.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {generateTasks.isPending ? "Generating…" : "AI Generate Tasks"}
        </Button>
      </div>

      {/* Add task input */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={handleAdd}
          disabled={!newTitle.trim() || createTask.isPending}
          className="gap-1"
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

      {/* Pending tasks */}
      {!isLoading && pendingTasks.length > 0 && (
        <div className="space-y-2">
          {pendingTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onDismiss={handleDismiss}
              onDelete={handleDelete}
              onCyclePriority={handleCyclePriority}
            />
          ))}
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
            <div className="space-y-2 opacity-60">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDismiss={handleDismiss}
                  onDelete={handleDelete}
                  onCyclePriority={handleCyclePriority}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  onToggle: (t: Task) => void;
  onDismiss: (t: Task) => void;
  onDelete: (t: Task) => void;
  onCyclePriority: (t: Task) => void;
}

function TaskRow({ task, onToggle, onDismiss, onDelete, onCyclePriority }: TaskRowProps) {
  const isDone = task.status !== "pending";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors group",
        isDone && "bg-muted/30"
      )}
    >
      {/* Check button */}
      <button
        onClick={() => onToggle(task)}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        title={isDone ? "Mark pending" : "Mark complete"}
      >
        {isDone ? (
          <CheckCircle2 size={20} className="text-primary" />
        ) : (
          <Circle size={20} />
        )}
      </button>

      {/* Title */}
      <span
        className={cn(
          "flex-1 text-sm leading-snug",
          isDone && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </span>

      {/* Source badge (AI only) */}
      {task.source === "ai" && (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full shrink-0">
          <Sparkles size={10} />
          AI
        </span>
      )}

      {/* Due date */}
      {task.dueDate && (
        <span className="hidden sm:block text-xs text-muted-foreground shrink-0">
          {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}

      {/* Priority badge — click to cycle */}
      <button
        onClick={() => onCyclePriority(task)}
        title="Click to change priority"
        className={cn(
          "hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 transition-opacity",
          PRIORITY_COLORS[task.priority],
          isDone && "opacity-50"
        )}
      >
        {task.priority}
      </button>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!isDone && (
          <button
            onClick={() => onDismiss(task)}
            className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded transition-colors"
            title="Dismiss"
          >
            Dismiss
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

import type { Task, TaskPriority } from "@workspace/api-client-react";

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Due dates are calendar dates, serialized by the API as midnight UTC.
// Preserve their date portion rather than shifting them into the browser timezone.
export function taskDueDate(task: Pick<Task, "dueDate">): string | null {
  if (!task.dueDate) return null;
  const date = task.dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function overdueDays(task: Pick<Task, "status" | "dueDate">, today: string): number {
  const dueDate = taskDueDate(task);
  if (task.status !== "pending" || !dueDate || dueDate >= today) return 0;
  // UTC calendar arithmetic avoids 23/25-hour days at daylight-saving changes.
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / DAY_MS);
}

export function sortTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "pending") return -1;
      if (b.status === "pending") return 1;
    }
    const aOverdue = overdueDays(a, today);
    const bOverdue = overdueDays(b, today);
    if (Boolean(aOverdue) !== Boolean(bOverdue)) return aOverdue ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

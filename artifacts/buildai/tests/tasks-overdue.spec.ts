import { test, expect } from "@playwright/test";
import type { Task } from "@workspace/api-client-react";
import { localDateKey, overdueDays, sortTasks, taskDueDate } from "../src/lib/task-dates";

const task = (id: number, dueDate: string | null, priority: Task["priority"] = "medium", status: Task["status"] = "pending"): Task => ({
  id, title: `Task ${id}`, dueDate, priority, status, source: "manual",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
});

test("only past-due pending tasks are overdue, irrespective of creation age", () => {
  const today = "2026-10-08";
  expect(overdueDays(task(1, "2026-10-07T00:00:00Z"), today)).toBe(1);
  expect(overdueDays(task(1, "2026-10-05"), today)).toBe(3);
  for (const due of [null, "invalid", "2026-02-30", "2026-10-08", "2026-10-09"]) {
    expect(overdueDays(task(1, due), today)).toBe(0);
  }
  for (const status of ["completed", "dismissed"] as const) {
    expect(overdueDays(task(1, "2026-10-01", "high", status), today)).toBe(0);
  }
  expect(overdueDays(task(1, "2026-03-07"), "2026-03-09")).toBe(2);
  expect(taskDueDate(task(1, "2026-10-07T00:00:00Z"))).toBe("2026-10-07");
  expect(localDateKey(new Date(2026, 9, 8, 0, 1))).toBe(today);
});

test("overdue tasks outrank today's high priority tasks without mutating data", () => {
  const tasks = [
    task(1, null, "high"),
    task(2, "2026-10-08", "high"),
    task(3, "2026-10-07", "low"),
    task(4, "2026-10-01", "high"),
    task(5, "2026-10-01", "high", "completed"),
  ];
  expect(sortTasks(tasks, "2026-10-08").map(t => t.id)).toEqual([4, 3, 1, 2, 5]);
  expect(tasks.map(t => t.id)).toEqual([1, 2, 3, 4, 5]);
});

test.describe("task list carry-forward", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  let tasks: Task[];
  test.beforeEach(async ({ page }) => {
    tasks = [
      task(1, "2026-10-08T00:00:00Z", "high"),
      task(2, "2026-10-07T00:00:00Z", "low"),
      task(3, "2026-10-05T00:00:00Z"),
      task(4, null, "high"),
      task(5, "2026-10-01T00:00:00Z", "high", "completed"),
      task(6, "2026-10-01T00:00:00Z", "high", "dismissed"),
    ];
    await page.clock.install({ time: new Date("2026-10-08T12:00:00-07:00") });
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/tasks") {
        await route.fulfill({ json: tasks });
      } else if (/^\/api\/tasks\/\d+$/.test(path) && route.request().method() === "PATCH") {
        const id = Number(path.split("/").at(-1));
        const index = tasks.findIndex(t => t.id === id);
        tasks[index] = { ...tasks[index], ...route.request().postDataJSON() };
        await route.fulfill({ json: tasks[index] });
      } else {
        await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true } : path === "/api/company" ? { name: "Test contractor" } : path.includes("count") ? { count: 0 } : [] });
      }
    });
  });

  test("overdue first, clear labels, no overdue flag on completed or undated tasks", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.getByText("4 pending tasks · 2 overdue")).toBeVisible();
    await page.getByTestId("task-section-todo").click();
    expect(await page.locator('[data-testid^="task-row-"]').evaluateAll(rows => rows.map(r => r.getAttribute("data-testid"))))
      .toEqual(["task-row-3", "task-row-2", "task-row-1", "task-row-4"]);
    await expect(page.getByTestId("task-row-2")).toContainText("Overdue · from yesterday");
    await expect(page.getByTestId("task-row-2")).toContainText("Oct 7");
    await expect(page.getByTestId("task-row-3")).toContainText("Overdue · 3 days");
    await expect(page.getByTestId("task-row-1")).not.toContainText("Overdue");
    await expect(page.getByTestId("task-row-4")).not.toContainText("Overdue");
    await page.getByRole("button", { name: "2 completed / dismissed" }).click();
    await expect(page.getByTestId("task-row-5")).not.toContainText("Overdue");
    await expect(page.getByTestId("task-row-6")).not.toContainText("Overdue");
    await page.reload();
    await page.getByTestId("task-section-todo").click();
    await expect(page.getByTestId("task-row-2")).toContainText("Overdue · from yesterday");
  });

  test("completion and dismissal remove overdue indicators; reopening restores them", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByTestId("task-section-todo").click();
    await page.getByTestId("task-row-2").getByTitle("Mark complete", { exact: true }).click();
    await expect(page.getByText("3 pending tasks · 1 overdue")).toBeVisible();
    await page.getByRole("button", { name: "3 completed / dismissed" }).click();
    await expect(page.getByTestId("task-row-2")).not.toContainText("Overdue");
    await page.getByTestId("task-row-2").getByTitle("Mark pending", { exact: true }).click();
    await expect(page.getByTestId("task-row-2")).toContainText("Overdue · from yesterday");
    await page.getByTestId("task-row-3").hover();
    await page.getByTestId("task-row-3").getByTitle("Dismiss", { exact: true }).click();
    await expect(page.getByText("3 pending tasks · 1 overdue")).toBeVisible();
    await expect(page.getByTestId("task-row-3")).not.toContainText("Overdue");
  });

  test("open page rolls over at local midnight without changing due dates", async ({ page }) => {
    await page.clock.setSystemTime(new Date("2026-10-08T23:59:59-07:00"));
    await page.goto("/tasks");
    await page.getByTestId("task-section-todo").click();
    await expect(page.getByTestId("task-row-1")).not.toContainText("Overdue");
    await page.clock.runFor(2000);
    await expect(page.getByText("4 pending tasks · 3 overdue")).toBeVisible();
    await expect(page.getByTestId("task-row-1")).toContainText("Overdue · from yesterday");
    await expect(page.getByTestId("task-row-2")).toContainText("Overdue · 2 days");
    expect(tasks[0].dueDate).toBe("2026-10-08T00:00:00Z");
  });

  test("overdue label stays visible on a phone-sized screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks");
    await page.getByTestId("task-section-todo").click();
    await expect(page.getByText("Overdue · from yesterday", { exact: true })).toBeVisible();
  });

  test("opens one large category at a time, preserving task links and completion rules", async ({ page }) => {
    tasks = [
      task(11, "2026-10-07", "high"),
      task(12, "2026-10-09"),
      task(13, null),
      task(14, "2026-10-06", "medium"),
    ].map((item, index) => ({
      ...item,
      title: [
        "Review quote with customer",
        "Prepare invoice breakdown",
        "Call customer re job #91",
        "Arrange EICR certificate",
      ][index],
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks");

    await expect(page.getByTestId("task-section-quotes")).toContainText("1 pending");
    await expect(page.getByTestId("task-section-invoices")).toContainText("1 pending");
    await expect(page.getByTestId("task-section-certificates")).toContainText("1 pending");
    await expect(page.getByTestId("task-section-todo")).toContainText("1 pending");
    expect(await page.locator('[data-testid^="task-row-"]').count()).toBe(0);
    const tile = page.getByTestId("task-section-invoices");
    expect((await tile.boundingBox())?.height).toBeGreaterThanOrEqual(150);
    await tile.click();
    await expect(page.getByTestId("task-panel-invoices")).toBeVisible();
    expect(await page.locator('[data-testid^="task-row-"]').count()).toBe(1);
    await expect(page.getByTestId("task-row-12").getByRole("link", { name: "Open invoices area" })).toHaveAttribute("href", "/invoices");

    await page.getByTestId("task-row-12").getByTitle("Mark complete", { exact: true }).click();
    expect(tasks.find((item) => item.id === 12)?.status).toBe("completed");
    await page.getByTestId("back-to-task-categories").click();
    await expect(page.getByTestId("task-section-invoices")).toContainText("0 pending");

    await page.getByTestId("task-section-todo").click();
    await expect(page.getByTestId("task-row-13").getByRole("link", { name: "Open job 91" })).toHaveAttribute("href", "/jobs/91");
    await page.getByLabel("Search to-do list tasks").fill("not here");
    await expect(page.getByText("No tasks match your search.")).toBeVisible();
    await page.getByLabel("Search to-do list tasks").fill("customer");
    await expect(page.getByTestId("task-row-13")).toBeVisible();
    await page.getByTestId("back-to-task-categories").click();
    await page.getByTestId("task-section-certificates").click();
    await expect(page.getByTestId("task-row-14")).toContainText("EICR");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("shows four selectable zero-count categories when there are no tasks", async ({ page }) => {
    tasks = [];
    await page.goto("/tasks");
    for (const section of ["quotes", "invoices", "certificates", "todo"]) {
      await expect(page.getByTestId(`task-section-${section}`)).toContainText("0 pending");
    }
    await page.getByTestId("task-section-quotes").click();
    await expect(page.getByText("No pending quotes tasks.")).toBeVisible();
    await page.getByTestId("back-to-task-categories").click();
    await expect(page.getByTestId("task-categories")).toBeVisible();
  });
});

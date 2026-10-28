import { test, expect } from "@playwright/test";
import type { Task } from "@workspace/api-client-react";

const task = (id: number, status: Task["status"] = "pending"): Task => ({
  id, title: `Task ${id}`, status, priority: "medium", source: "manual",
  dueDate: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
});

let tasks: Task[];
test.beforeEach(async ({ page }) => {
  tasks = [task(1), task(2), task(3, "completed"), task(4, "dismissed")];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tasks") {
      await route.fulfill({ json: tasks });
    } else if (/^\/api\/tasks\/\d+$/.test(path) && route.request().method() === "PATCH") {
      const index = tasks.findIndex(t => t.id === Number(path.split("/").at(-1)));
      tasks[index] = { ...tasks[index], ...route.request().postDataJSON() };
      await route.fulfill({ json: tasks[index] });
    } else {
      await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true }
        : path === "/api/company" ? { name: "Test Company" }
        : path.endsWith("/unreviewed-count") ? { count: 5 } : [] });
    }
  });
});

test("counts only pending tasks and follows completion/reopening through the shared query", async ({ page }) => {
  await page.goto("/tasks");
  const nav = page.getByRole("link", { name: /Tasks/ });
  await expect(nav.getByLabel("2 pending tasks")).toHaveText("2");
  await page.getByTestId("task-row-1").getByTitle("Mark complete", { exact: true }).click();
  await expect(nav.getByLabel("1 pending task", { exact: true })).toHaveText("1");
  await page.getByTestId("task-row-2").getByTitle("Mark complete", { exact: true }).click();
  await expect(nav.locator("[aria-label]")).toHaveCount(0);
  await page.getByRole("button", { name: "4 completed / dismissed" }).click();
  await page.getByTestId("task-row-1").getByTitle("Mark pending", { exact: true }).click();
  await expect(nav.getByLabel("1 pending task", { exact: true })).toHaveText("1");
});

test("refreshes external changes while away from Daily Tasks", async ({ page }) => {
  await page.clock.install();
  await page.goto("/contacts");
  const nav = page.getByRole("link", { name: /Daily Tasks/ });
  await expect(nav.getByLabel("2 pending tasks")).toHaveText("2");
  tasks = [task(1, "completed"), task(2, "dismissed")];
  await page.clock.fastForward(30_000);
  await expect(nav.locator("[aria-label]")).toHaveCount(0);
  tasks = [task(5)];
  await page.clock.fastForward(30_000);
  await expect(nav.getByLabel("1 pending task", { exact: true })).toHaveText("1");
});

test("shows the badge in the mobile drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: /Daily Tasks/ }).getByLabel("2 pending tasks")).toBeVisible();
});

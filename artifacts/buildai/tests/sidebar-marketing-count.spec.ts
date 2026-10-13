import { test, expect } from "@playwright/test";

let drafts: { id: number; status: string }[];

test.beforeEach(async ({ page }) => {
  drafts = [
    { id: 1, status: "pending" }, { id: 2, status: "pending" },
    { id: 3, status: "approved" }, { id: 4, status: "dismissed" },
  ];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true }
      : path === "/api/company" ? { name: "Test Company" }
      : path === "/api/marketing-drafts" ? drafts
      : path.endsWith("/unreviewed-count") ? { count: 5 } : [] });
  });
});

test("counts only pending drafts and refreshes external approvals, dismissals and new drafts", async ({ page }) => {
  await page.clock.install();
  await page.goto("/contacts");
  const nav = page.getByRole("link", { name: /AI Receptionist/ });
  await expect(nav.getByLabel("2 pending marketing drafts")).toHaveText("2");
  await expect(nav.getByLabel("2 pending marketing drafts")).toHaveClass(/bg-red-600/);
  drafts[0].status = "approved";
  await page.clock.fastForward(15_000);
  await expect(nav.getByLabel("1 pending marketing draft", { exact: true })).toHaveText("1");
  drafts[1].status = "dismissed";
  await page.clock.fastForward(15_000);
  await expect(nav.locator("[data-testid^='badge-']")).toHaveCount(0);
  drafts.push({ id: 5, status: "pending" });
  await page.clock.fastForward(15_000);
  await expect(nav.getByLabel("1 pending marketing draft", { exact: true })).toHaveText("1");
});

test("hides the badge for an empty queue", async ({ page }) => {
  drafts = [];
  await page.goto("/contacts");
  await expect(page.getByRole("link", { name: /AI Receptionist/ })).toBeVisible();
  await expect(page.getByTestId("badge-ai-receptionist")).toHaveCount(0);
});

test("updates immediately after approving and dismissing from the Marketing Queue", async ({ page }) => {
  await page.clock.install();
  drafts = drafts.slice(0, 2).map(draft => ({
    ...draft, type: "review_request", clientName: `Customer ${draft.id}`,
    clientPhone: "+447700900123", channel: "sms", draftMessage: "Thank you for choosing us.",
  }));
  await page.route(/\/api\/marketing-drafts\/\d+\/(approve|dismiss)$/, async route => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const draft = drafts.find(item => item.id === Number(parts[3]))!;
    draft.status = parts[4] === "approve" ? "approved" : "dismissed";
    await route.fulfill({ json: draft });
  });
  await page.goto("/assistants");
  const badge = page.getByTestId("badge-ai-receptionist");
  await expect(badge).toHaveText("2");
  await page.getByRole("button", { name: "Approve & send" }).first().click();
  await expect(badge).toHaveText("1");
  await page.getByRole("button", { name: "Dismiss", exact: true }).last().click();
  await expect(badge).toHaveCount(0);
});

test("shows the pending badge in the mobile drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: /AI Receptionist/ }).getByLabel("2 pending marketing drafts")).toBeVisible();
});

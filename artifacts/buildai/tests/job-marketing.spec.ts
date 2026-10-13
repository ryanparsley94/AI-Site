import { expect, test } from "@playwright/test";

const job = {
  id: 42, title: "Socket repair", contactName: "Test Customer", contactPhone: "07000000000",
  status: "scheduled", serviceType: "Repair", scheduledAt: "2026-10-13T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
};

test("generates both drafts for a non-completed job and keeps the button disabled after reload", async ({ page }) => {
  let drafts: object[] = [];
  let posts = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/marketing-drafts/generate") {
      posts++;
      expect(route.request().postDataJSON()).toEqual({
        jobId: 42, jobTitle: job.title, clientName: job.contactName,
        clientPhone: job.contactPhone, companyName: "Test Company",
      });
      drafts = ["review_request", "followup"].map((type, i) => ({
        id: i + 1, jobId: 42, jobTitle: job.title, type, status: "pending", draftMessage: null,
      }));
      await route.fulfill({ status: 201, json: drafts });
    } else {
      await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true }
        : path === "/api/company" ? { name: "Test Company" }
        : path === "/api/jobs/42" ? job
        : path === "/api/marketing-drafts" ? drafts : [] });
    }
  });
  await page.goto("/jobs/42");
  const button = page.getByTestId("button-generate-messages");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.getByText("Messages already exist for this job.", { exact: false })).toBeVisible();
  expect(drafts).toHaveLength(2);
  expect(posts).toBe(1);
  await page.reload();
  await expect(button).toBeDisabled();
  await expect(page.getByRole("link", { name: "Open Marketing Queue" })).toHaveAttribute("href", "/assistants");
});

test("blocks generation for existing dismissed drafts and allows unrelated jobs", async ({ page }) => {
  let ownDraft = true;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true }
      : path === "/api/company" ? { name: "Test Company" }
      : path === "/api/jobs/42" ? job
      : path === "/api/marketing-drafts" ? [{ id: 1, jobId: ownDraft ? 42 : 99, status: "dismissed" }] : [] });
  });
  await page.goto("/jobs/42");
  const button = page.getByTestId("button-generate-messages");
  await expect(page.getByText("Messages already exist for this job.", { exact: false })).toBeVisible();
  await expect(button).toBeDisabled();
  ownDraft = false;
  await page.reload();
  await expect(button).toBeEnabled();
});

test("shows failed checks and failed generation without claiming success", async ({ page }) => {
  let checkFails = true;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if ((path === "/api/marketing-drafts" && checkFails) || path.endsWith("/generate")) {
      await route.fulfill({ status: 500, json: { error: "Unavailable" } });
    } else {
      await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true }
        : path === "/api/company" ? { name: "Test Company" }
        : path === "/api/jobs/42" ? job : [] });
    }
  });
  await page.goto("/jobs/42");
  const button = page.getByTestId("button-generate-messages");
  await expect(page.getByText("Could not check messages or business details.")).toBeVisible();
  await expect(button).toBeDisabled();
  checkFails = false;
  await page.getByRole("button", { name: "Retry message check" }).click();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText("Could not generate messages", { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
});

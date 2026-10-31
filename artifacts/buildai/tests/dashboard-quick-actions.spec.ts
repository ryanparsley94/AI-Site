import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/check" ? { authenticated: true }
      : path === "/api/company" ? { name: "Parsley Electrical" }
      : path === "/api/dashboard/summary" ? {
          callsToday: 3,
          missedCallsToday: 1,
          jobsThisWeek: 5,
          invoiceStats: { paidThisMonth: 1200 },
        }
      : path === "/api/pilot/readiness" ? {
          phoneConfigured: true,
          emailInboundConfigured: true,
          emailOutboundConfigured: true,
          ownerEmailConfigured: true,
          completedCalls: 8,
          ownerSummariesSent: 8,
          inboundEmails: 4,
          emailRepliesSent: 3,
        }
      : [];
    await route.fulfill({ json: data });
  });
});

test("dashboard actions stay tappable and avoid horizontal overflow from phone to desktop", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(page.getByTestId("page-dashboard")).toBeVisible();

    const tiles = [
      ["quick-action-new-job", "/jobs"],
      ["quick-action-create-quote", "/quotes"],
      ["quick-action-invoice", "/invoices"],
      ["quick-action-enquiries", "/calls"],
    ] as const;
    const boxes = [];
    for (const [testId, href] of tiles) {
      const tile = page.getByTestId(testId);
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute("href", href);
      const box = await tile.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(142);
      boxes.push(box!);
    }

    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    if (width < 1024) {
      expect(Math.abs(boxes[0].x - boxes[2].x)).toBeLessThan(2);
      expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    } else {
      expect(boxes[3].x).toBeGreaterThan(boxes[2].x);
    }

    for (const label of ["Calls today", "Jobs today", "Cash outstanding"]) {
      await expect(page.getByTestId(`metric-${label.toLowerCase().replaceAll(" ", "-")}`)).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("quick-action tiles navigate to their existing screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const destinations = [
    ["quick-action-new-job", "/jobs"],
    ["quick-action-create-quote", "/quotes"],
    ["quick-action-invoice", "/invoices"],
    ["quick-action-enquiries", "/calls"],
  ] as const;

  for (const [testId, destination] of destinations) {
    await page.goto("/dashboard");
    await page.getByTestId(testId).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  }
});

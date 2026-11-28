import { test, expect } from "@playwright/test";

test("CRM screen offers protected customer and site CSV downloads", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/check") return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/contacts/export/customers.csv") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: {
          "content-disposition": 'attachment; filename="crewon-customers.csv"',
          "cache-control": "no-store",
        },
        body: '\uFEFF"Customer Name","Phone Number"\r\n"Example Customer","07700900123"\r\n',
      });
    }
    if (path === "/api/contacts/export/sites.csv") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: {
          "content-disposition": 'attachment; filename="crewon-sites.csv"',
          "cache-control": "no-store",
        },
        body: '\uFEFF"Customer","Site Name"\r\n"Example Customer","Synthetic Test House"\r\n',
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data-import");
  await expect(page.getByRole("heading", { name: /Import from Tradify/i })).toBeVisible();
  await expect(page.getByText(/These exports do not include/)).toBeVisible();
  for (const [testId, filename] of [
    ["download-crewon-customers", "crewon-customers.csv"],
    ["download-crewon-sites", "crewon-sites.csv"],
  ] as const) {
    const link = page.getByTestId(testId);
    await expect(link).toBeVisible();
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const downloaded = page.waitForEvent("download");
    await link.click();
    expect((await downloaded).suggestedFilename()).toBe(filename);
  }
});

import { test, expect } from "@playwright/test";
import { format } from "date-fns";

const today = new Date();
const isoDay = (offset: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString();
};
const atLocalTime = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

test.describe("responsive CREWON daily workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = path === "/api/contacts" ? [{ id: 21, name: "A very long customer name for narrow screens", type: "lead", phone: "+44 7700 900123", address: "14 Example Road, Manchester" }]
        : path === "/api/quotes" ? [{ id: 31, title: "Kitchen and hallway lighting upgrade", status: "reviewed", sharedAt: isoDay(-2), totalIncVat: 1250, grandTotal: 1250 }]
        : path === "/api/invoices" ? [
          { id: 41, invoiceNumber: "INV-0041", clientName: "Parsley Electrical customer", dueDate: isoDay(-4), status: "sent", total: 850 },
          { id: 42, invoiceNumber: "INV-0042", clientName: "Another customer", dueDate: isoDay(5), status: "sent", total: 460 },
        ]
        : path === "/api/jobs" ? [
          { id: 51, title: "Consumer unit inspection", contactName: "Customer A", contactPhone: "07700 900100", serviceType: "Inspection", address: "14 Example Road", scheduledAt: atLocalTime(9, 0), estimatedDuration: 90, estimatedValue: 0, status: "scheduled", assignedEngineer: "Engineer A" },
          { id: 52, title: "Socket repair", contactName: "Customer B", contactPhone: "07700 900101", serviceType: "Repair", address: "16 Example Road", scheduledAt: atLocalTime(9, 30), estimatedDuration: 60, estimatedValue: 0, status: "scheduled", assignedEngineer: "Engineer B" },
          { id: 53, title: "Lighting test", contactName: "Customer C", contactPhone: "07700 900102", serviceType: "Inspection", address: "18 Example Road", scheduledAt: atLocalTime(11, 0), estimatedDuration: 30, estimatedValue: 0, status: "scheduled", assignedEngineer: "Engineer A" },
        ]
        : path === "/api/auth/check" ? { authenticated: true }
        : path === "/api/company" ? { name: "Parsley Electrical" }
        : [];
      await route.fulfill({ json });
    });
  });

  test("Sales tiles, invoice filters and cards have usable narrow-screen targets", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/sales");
    const invoiceTile = page.getByTestId("sales-tile-invoices");
    await expect(invoiceTile).toBeVisible();
    expect((await invoiceTile.boundingBox())?.height).toBeGreaterThanOrEqual(88);
    await invoiceTile.focus();
    await page.keyboard.press("Enter");
    await expect(invoiceTile).toHaveAttribute("aria-pressed", "true");

    const overdue = page.getByTestId("invoice-filter-overdue");
    expect((await overdue.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(overdue).toContainText("1");
    await overdue.click();
    await expect(page.getByText("INV-0041 · Parsley Electrical customer")).toBeVisible();
    await expect(page.getByRole("link", { name: /INV-0041/ })).toContainText("due");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("mobile quick navigation exposes core daily screens with touch-sized links", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales");
    for (const label of ["home", "jobs", "scheduler", "tasks", "more"]) {
      const link = page.getByTestId(`mobile-nav-${label}`);
      await expect(link).toBeVisible();
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(58);
    }
    await page.getByTestId("mobile-nav-tasks").click();
    await expect(page.getByTestId("task-categories")).toBeVisible();
    await page.getByTestId("mobile-nav-scheduler").click();
    await expect(page.getByTestId("page-schedule")).toBeVisible();
    await page.getByTestId("mobile-nav-more").click();
    await expect(page.getByTestId("mobile-nav-more")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("link-sidebar-home").last()).toBeVisible();
  });

  test("day and week timelines position duration-sized overlaps; month agenda is tappable without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/schedule");
    await page.getByTestId("button-view-day").click();
    const first = page.getByTestId("day-event-51");
    const second = page.getByTestId("day-event-52");
    await expect(first).toHaveAttribute("data-start-minute", "540");
    await expect(first).toHaveAttribute("data-duration-minutes", "90");
    await expect(first).toHaveAttribute("data-overlap-lanes", "2");
    await expect(second).toHaveAttribute("data-overlap-lane", "1");
    const firstBox = await first.boundingBox(), secondBox = await second.boundingBox();
    expect(firstBox?.height).toBeGreaterThan(secondBox?.height ?? 0);
    expect(firstBox?.x).not.toBe(secondBox?.x);
    expect(await first.evaluate((node) => (node as HTMLElement).style.top)).toBe("540px");
    expect(await first.evaluate((node) => (node as HTMLElement).style.height)).toBe("90px");
    await page.getByTestId("button-view-week").click();
    await expect(page.getByTestId("week-timeline")).toBeVisible();
    await expect(page.getByRole("link", { name: /Consumer unit inspection/ })).toBeVisible();

    await page.getByTestId("button-view-month").click();
    const initialPeriod = await page.getByTestId("schedule-period").innerText();
    const dayButton = page.getByRole("button", { name: new RegExp(`${new Date().getDate()} ${format(new Date(), "MMMM")}`) });
    await dayButton.click();
    await expect(page.getByTestId("month-agenda-job-51")).toHaveAttribute("href", "/jobs/51");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page.getByTestId("schedule-period")).not.toHaveText(initialPeriod);
    expect(await page.locator('[data-testid^="month-day-"]').count()).toBeGreaterThanOrEqual(35);
  });
});

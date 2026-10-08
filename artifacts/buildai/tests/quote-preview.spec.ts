import { test, expect, type Page } from "@playwright/test";
import { blankQuoteWorkflow } from "@workspace/api-zod";

const logo = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#c83a52"/></svg>');
const company = {
  id: 1, name: "Preview Electrical", phone: "020 0000 0000", email: "office@example.test",
  address: "10 Sample Road", timezone: "Europe/London", createdAt: "2026-10-08T12:00:00Z",
  quoteTemplate: "classic", quoteAccentColor: "#c83a52", quoteTagline: "Local trades you trust",
  quoteFooterText: "Thank you for choosing our team.", logoUrl: logo,
};
const workflow = {
  ...blankQuoteWorkflow(), customerName: "Sample Customer", siteAddress: "20 Test Lane",
  scope: "Install sockets", paymentTerms: "Bank transfer within 30 days",
  sections: [{ id: "work", title: "Electrical work", items: [
    { id: "material", type: "materials", description: "Double socket", quantity: 2, unit: "item", costPrice: 10, sellPrice: 20 },
    { id: "labour", type: "labour", description: "Installation", quantity: 3, unit: "hrs", costPrice: 15, sellPrice: 30 },
  ] }],
};

async function open(page: Page, status = "draft", branding = company) {
  let writes = 0;
  const record = {
    id: 701, title: "Socket installation", status, createdAt: company.createdAt, revision: 1,
    grandTotal: 156, workflow, materials: [],
    ...(status === "accepted" ? { companySnapshot: { ...company, name: "Original Electrical", quoteTemplate: "minimal", quoteAccentColor: "#114488" } } : {}),
  };
  await page.route("**/api/**", async route => {
    if (route.request().method() !== "GET") writes++;
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true } : path === "/api/company" ? branding : path === "/api/quotes" ? [record] : path.includes("count") ? { count: 0 } : [] });
  });
  await page.goto("/quotes");
  await page.getByTestId("button-open-701").click();
  return () => writes;
}

test("live preview updates materials, labour, margin, VAT and deposits without leaking costs", async ({ page }) => {
  await open(page);
  await page.getByTestId("button-toggle-live-preview").click();
  const paper = page.getByTestId("customer-preview");
  await expect(paper).toContainText("Double socket");
  await expect(paper).toContainText("Installation");
  await expect(page.getByTestId("preview-totals")).toContainText("£156.00");
  await page.getByTestId("input-qty-material").fill("4");
  await expect(page.getByTestId("preview-totals")).toContainText("£204.00");
  await page.getByTestId("input-row-material-percent").fill("50");
  await page.getByTestId("select-row-material-method").selectOption("margin");
  await page.getByTestId("button-row-material-apply").click();
  await page.getByTestId("input-sell-labour").fill("40");
  await expect(page.getByTestId("preview-totals")).toContainText("£240.00");
  await page.getByTestId("input-vat-percent").fill("5");
  await expect(page.getByTestId("preview-totals")).toContainText("£210.00");
  await page.getByTestId("select-deposit-mode").selectOption("percentage");
  await page.getByTestId("input-deposit-value").fill("25");
  await expect(page.getByTestId("preview-totals")).toContainText("£52.50");
  await expect(page.getByTestId("preview-totals")).toContainText("£157.50");
  await expect(paper).not.toContainText(/Your cost|Profit|Markup|Margin|AI estimate/);
  await page.getByTestId("input-quote-title").fill("Updated scope");
  await expect(paper).toContainText("Updated scope");
  await page.getByTestId("button-remove-item-material").click();
  await expect(paper).not.toContainText("Double socket");
  await expect(page.getByTestId("preview-totals")).toContainText("£126.00");
});

test("template comparisons show saved branding without saving or dirtying the quote", async ({ page }) => {
  const writes = await open(page);
  await expect(page.getByTestId("button-save-quote")).toBeDisabled();
  await page.getByTestId("tab-customer").click();
  for (const template of ["modern", "minimal", "classic"]) {
    await page.getByTestId(`button-preview-template-${template}`).click();
    await expect(page.getByTestId("customer-preview")).toHaveAttribute("data-template", template);
    await expect(page.getByTestId("customer-preview")).toContainText(company.quoteTagline);
    await expect(page.getByTestId("customer-preview")).toContainText(company.quoteFooterText);
    await expect(page.getByTestId("img-preview-logo")).toBeVisible();
    await expect(page.getByTestId("button-save-quote")).toBeDisabled();
  }
  await page.getByTestId("button-preview-template-modern").click();
  await expect(page.getByTestId("text-preview-template-note")).toContainText("PDF will still use your saved Classic");
  await expect(page.getByTestId("preview-accent-stripe")).toHaveCSS("background-color", "rgb(200, 58, 82)");
  await page.getByTestId("button-preview-reset").click();
  await expect(page.getByTestId("customer-preview")).toHaveAttribute("data-template", "classic");
  expect(writes()).toBe(0);
});

test("accepted quote keeps original branding and read-only workflow", async ({ page }) => {
  await open(page, "accepted");
  await expect(page.getByTestId("input-quote-title")).toBeDisabled();
  await page.getByTestId("button-toggle-live-preview").click();
  await expect(page.getByTestId("customer-preview")).toContainText("Original Electrical");
  await expect(page.getByTestId("customer-preview")).toHaveAttribute("data-template", "minimal");
  await expect(page.getByTestId("button-preview-template-modern")).toBeDisabled();
});

test("invalid pricing hides totals and recovers after correction", async ({ page }) => {
  await open(page);
  await page.getByTestId("button-toggle-live-preview").click();
  await page.getByTestId("input-vat-percent").fill("101");
  await expect(page.getByTestId("customer-preview-error")).toContainText("VAT must be between 0 and 100%");
  await expect(page.getByTestId("preview-totals")).toHaveCount(0);
  await page.getByTestId("input-vat-percent").fill("20");
  await expect(page.getByTestId("preview-totals")).toContainText("£156.00");
});

test("configured logo failures are visible", async ({ page }) => {
  await page.route("**/broken-logo.png", route => route.fulfill({ status: 404 }));
  await open(page, "draft", { ...company, logoUrl: "/broken-logo.png" });
  await page.getByTestId("tab-customer").click();
  await expect(page.getByTestId("text-logo-error")).toContainText("Logo could not load");
});

test("preview fits phone and desktop widths and remains available after toggling", async ({ page }) => {
  await open(page);
  await page.getByTestId("button-toggle-live-preview").click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const container = page.getByTestId("preview-paper-container");
    await container.scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const paper = await page.getByTestId("customer-preview").boundingBox();
      const box = await container.boundingBox();
      return !!paper && !!box && paper.width <= box.width + 1 && box.x + box.width <= width + 1;
    }).toBe(true);
  }
  await page.getByTestId("button-toggle-live-preview").click();
  await expect(page.getByTestId("live-preview")).toHaveCount(0);
  await page.getByTestId("button-toggle-live-preview").click();
  await expect(page.getByTestId("preview-totals")).toContainText("£156.00");
});

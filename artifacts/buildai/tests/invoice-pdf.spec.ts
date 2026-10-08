import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Company, Invoice } from "@workspace/api-client-react";

const invoice: Invoice = {
  id: 601, invoiceNumber: "INV-601", status: "sent", issueDate: "2026-10-08",
  dueDate: "2026-11-07", clientName: "Sample Customer", createdAt: "2026-10-08T12:00:00Z",
  lineItems: [{ name: "Electrical installation", quantity: 2, unit: "each", unitPrice: 13.333, total: 26.68 }],
  subtotal: 26.68, vatPercent: 20, vatAmount: 5.34, total: 32.02,
  notes: "Bank transfer reference INV-601.",
};
const company: Company = {
  id: 1, name: "Sample Electrical", phone: "020 0000 0000", email: "office@example.test",
  address: "10 Sample Road", timezone: "Europe/London", createdAt: invoice.createdAt,
  quoteTemplate: "classic", quoteAccentColor: "#c83a52", quoteTagline: "Reliable local trades",
  paymentTerms: "Payment within 30 days by bank transfer.", quoteFooterText: "Thank you for choosing our team.",
  logoUrl: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#c83a52"/><text x="12" y="28" font-size="24" fill="white">LOGO</text></svg>'),
};

async function openInvoice(page: Page, branding: Partial<Company> = {}, record: Invoice = invoice) {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/company" ? { ...company, ...branding }
      : path === "/api/invoices" ? [record]
      : path === `/api/invoices/${record.id}` ? record
      : path.includes("count") ? { count: 0 } : [];
    await route.fulfill({ json });
  });
  await page.goto("/invoices");
  await page.getByRole("button", { name: /INV-601/ }).click();
  await expect(page.getByTestId("button-download-invoice-pdf")).toBeEnabled();
}

async function download(page: Page, output: string) {
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("button-download-invoice-pdf").click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("invoice-inv-601.pdf");
  await file.saveAs(output);
  return execFileSync("pdftotext", ["-layout", output, "-"], { encoding: "utf8" });
}

for (const template of ["classic", "modern", "minimal"] as const) {
  test(`${template} invoice includes the saved branding, logo and authoritative amounts`, async ({ page }, testInfo) => {
    await openInvoice(page, { quoteTemplate: template });
    const output = testInfo.outputPath(`${template}.pdf`);
    const text = await download(page, output);
    for (const expected of [
      template === "minimal" ? "SAMPLE ELECTRICAL" : company.name,
      company.quoteTagline!, company.paymentTerms!, company.quoteFooterText!,
      invoice.invoiceNumber, invoice.dueDate, invoice.clientName!, invoice.notes!,
      "Electrical installation", "26.68", "5.34", "32.02", "Page 1 of 1",
    ]) expect(text).toContain(expected);
    const images = execFileSync("pdfimages", ["-list", output], { encoding: "utf8" });
    expect(images).toMatch(/\bimage\b/);
    // jsPDF leaves vector drawing streams uncompressed by default.
    const drawing = readFileSync(output, "latin1");
    expect(drawing).toContain("0.78 0.23 0.32 RG"); // Saved accent on rules / total divider.
    if (template === "classic") expect(drawing).toContain("0.051 0.09 0.11 rg");
    if (template === "modern") expect(drawing).toContain("0.78 0.23 0.32 rg");
    if (template === "minimal") expect(drawing).not.toContain("0.78 0.23 0.32 rg");
  });
}

test("no logo or optional branding still produces a usable invoice", async ({ page }, testInfo) => {
  await openInvoice(page, {
    logoUrl: null, quoteTemplate: undefined, quoteAccentColor: undefined,
    quoteTagline: null, paymentTerms: null, quoteFooterText: null,
  });
  const output = testInfo.outputPath("defaults.pdf");
  const text = await download(page, output);
  expect(text).toContain(company.name);
  expect(text).toContain("32.02");
  expect(execFileSync("pdfimages", ["-list", output], { encoding: "utf8" })).not.toMatch(/\bimage\b/);
});

test("long invoices and notes paginate without losing company terms", async ({ page }, testInfo) => {
  await openInvoice(page, { quoteTemplate: "modern" }, {
    ...invoice,
    lineItems: Array.from({ length: 80 }, (_, i) => ({ ...invoice.lineItems[0], name: `Installation line ${i + 1}` })),
    notes: Array.from({ length: 80 }, (_, i) => `Invoice instruction ${i + 1}`).join("\n"),
  });
  const text = await download(page, testInfo.outputPath("multipage.pdf"));
  expect(text).toContain("Installation line 80");
  expect(text).toContain("Invoice instruction 80");
  expect(text).toContain(company.paymentTerms!);
  expect(text).toContain(company.quoteFooterText!);
  expect(text).toMatch(/Page 1 of [2-9]/);
});

test("failed company refresh prevents an unbranded download", async ({ page }) => {
  await openInvoice(page);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/company", route => route.fulfill({ status: 500, json: { error: "Unavailable" } }));
  await page.getByTestId("button-download-invoice-pdf").click();
  await expect(page.getByText("Company branding could not be loaded. Please try again.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("button-download-invoice-pdf")).toBeEnabled();
  expect(downloads).toBe(0);
});

test("unavailable logo gives an actionable error instead of silently omitting it", async ({ page }) => {
  await openInvoice(page, { logoUrl: "/missing-company-logo.png" });
  await page.route("**/missing-company-logo.png", route => route.fulfill({ status: 404, body: "" }));
  await page.getByTestId("button-download-invoice-pdf").click();
  await expect(page.getByText("The company logo could not be loaded. Check the logo in Settings and try again.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("button-download-invoice-pdf")).toBeEnabled();
});

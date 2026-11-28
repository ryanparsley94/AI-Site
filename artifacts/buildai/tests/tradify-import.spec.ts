import { test, expect } from "@playwright/test";

const customerCsv = [
  "Customer Name,Contact Name,Mobile Number,Phone Number,Email Address,Physical Address Street,Physical Address Postal Code",
  "Example Customer,Alex, ,07700 900123,alex@example.test,12 Test Road,CM0 1AA",
].join("\n");

test("Tradify customer Choose file opens picker; preview required before import", async ({ page }) => {
  let imports = 0;
  let previews = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/check") {
      await route.fulfill({ json: { authenticated: true } });
      return;
    }
    if (url.pathname === "/api/imports/tradify/customers") {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postData()).toContain("Example Customer");
      if (url.searchParams.get("preview") === "true") {
        previews++;
        await route.fulfill({ json: {
          kind: "customers", totalRows: 1, validRows: 1, skippedRows: 0,
          headers: ["Customer Name", "Contact Name", "Phone Number", "Email Address"],
          sample: [{
            customerName: "Example Customer", contactName: "Alex",
            phone: "07700 900123", email: "alex@example.test",
          }],
        } });
      } else {
        imports++;
        await route.fulfill({ json: {
          kind: "customers", totalRows: 1, created: 1, updated: 0, skipped: 0, errors: [],
        } });
      }
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data-import");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-csv-customers").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "customer-export.csv", mimeType: "text/csv",
    buffer: Buffer.from(customerCsv),
  });
  await expect(page.getByText("customer-export.csv")).toBeVisible();
  await expect(page.getByTestId("button-import-run-customers")).toBeDisabled();
  await page.getByTestId("button-import-preview-customers").click();
  await expect(page.getByTestId("import-preview-sample-customers")).toContainText("Example Customer");
  expect(previews).toBe(1);
  expect(imports).toBe(0);
  await page.getByTestId("button-import-run-customers").click();
  await expect(page.getByText("Import finished")).toBeVisible();
  expect(imports).toBe(1);
});

test("Tradify import shows a useful error and does not enable writes for invalid CSV", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/check") {
      await route.fulfill({ json: { authenticated: true } });
      return;
    }
    if (url.pathname === "/api/imports/tradify/customers") {
      if (url.searchParams.get("preview") !== "true") writes++;
      await route.fulfill({ status: 400, json: {
        error: "Missing Customer Name or Customer column. No records were changed.",
      } });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto("/data-import");
  await page.getByTestId("input-tradify-customers-csv").setInputFiles({
    name: "wrong-export.csv", mimeType: "text/csv",
    buffer: Buffer.from("Invoice Number,Amount\nINV-001,15"),
  });
  await page.getByTestId("button-import-preview-customers").click();
  await expect(page.getByText(/Missing Customer Name or Customer column/)).toBeVisible();
  await expect(page.getByTestId("button-import-run-customers")).toBeDisabled();
  expect(writes).toBe(0);
});

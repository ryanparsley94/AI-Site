import { test, expect } from "@playwright/test";

const customerCsv = [
  "Customer Name,Contact Name,Mobile Number,Phone Number,Email Address,Physical Address Street,Physical Address Postal Code",
  "Example Customer,Alex, ,07700 900123,alex@example.test,12 Test Road,CM0 1AA",
].join("\n");

test("Tradify customer import opens picker, previews rows and requires confirmation", async ({ page }) => {
  let imports = 0;
  let previews = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/check") {
      await route.fulfill({ json: { authenticated: true } });
      return;
    }
    if (url.pathname === "/api/imports/tradify/customers") {
      if (url.searchParams.get("preview") === "true") {
        previews++;
        await route.fulfill({ json: {
          kind: "customers", totalRows: 1, validRows: 1, skippedRows: 0,
          headers: ["Customer Name", "Contact Name", "Phone Number", "Email Address"],
          sample: [{ customerName: "Example Customer", contactName: "Alex", phone: "07700 900123", email: "alex@example.test" }],
        } });
      } else {
        imports++;
        await route.fulfill({ json: { kind: "customers", totalRows: 1, created: 1, updated: 0, skipped: 0, errors: [] } });
      }
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data-import");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-csv-customers").click();
  await (await chooserPromise).setFiles({
    name: "synthetic-customers.csv", mimeType: "text/csv", buffer: Buffer.from(customerCsv),
  });
  await expect(page.getByText("synthetic-customers.csv")).toBeVisible();
  await expect(page.getByTestId("button-import-run-customers")).toBeDisabled();
  await page.getByTestId("button-import-preview-customers").click();
  await expect(page.getByTestId("import-preview-sample-customers")).toContainText("Example Customer");
  expect(previews).toBe(1);
  expect(imports).toBe(0);
  await page.getByTestId("button-import-run-customers").click();
  await expect(page.getByText("Import finished")).toBeVisible();
  expect(imports).toBe(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-csv-customers").click();
  await (await desktopChooserPromise).setFiles({
    name: "synthetic-desktop.csv", mimeType: "text/csv", buffer: Buffer.from(customerCsv),
  });
  await expect(page.getByText("synthetic-desktop.csv")).toBeVisible();
});

test("invalid customer CSV headers and unauthenticated responses do not permit writes", async ({ page }) => {
  let writes = 0;
  let responseStatus = 400;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/check") {
      await route.fulfill({ json: { authenticated: true } });
      return;
    }
    if (url.pathname === "/api/imports/tradify/customers") {
      if (url.searchParams.get("preview") !== "true") writes++;
      await route.fulfill({
        status: responseStatus,
        json: { error: responseStatus === 401 ? "Unauthorized — admin session required" : "Missing Customer Name or Customer column. No records were changed." },
      });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto("/data-import");
  await page.getByTestId("input-tradify-customers-csv").setInputFiles({
    name: "synthetic-invalid.csv", mimeType: "text/csv", buffer: Buffer.from("Invoice Number,Amount\nINV-001,15"),
  });
  await page.getByTestId("button-import-preview-customers").click();
  await expect(page.getByText("Missing Customer Name or Customer column. No records were changed.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("button-import-run-customers")).toBeDisabled();
  expect(writes).toBe(0);

  responseStatus = 401;
  await page.getByTestId("input-tradify-customers-csv").setInputFiles({
    name: "synthetic-valid.csv", mimeType: "text/csv", buffer: Buffer.from(customerCsv),
  });
  await page.getByTestId("button-import-preview-customers").click();
  await expect(page.getByText(/Unauthorized.*admin session required/i)).toBeVisible();
  expect(writes).toBe(0);
});

test("site import preview handles multiple synthetic locations", async ({ page }) => {
  const sitesCsv = "Customer,Site Name,Physical Address Street,Postcode\nExample Customer,Workshop,1 Test Street,CM0 1AA\nExample Customer,Store,2 Test Street,CM0 2BB";
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/check") return route.fulfill({ json: { authenticated: true } });
    if (url.pathname === "/api/imports/tradify/sites") {
      return route.fulfill({ json: {
        kind: "sites", totalRows: 2, validRows: 2, skippedRows: 0,
        headers: ["Customer", "Site Name", "Physical Address Street", "Postcode"],
        sample: [{ customerName: "Example Customer", siteName: "Workshop" }, { customerName: "Example Customer", siteName: "Store" }],
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/data-import");
  await page.getByTestId("input-tradify-sites-csv").setInputFiles({
    name: "synthetic-sites.csv", mimeType: "text/csv", buffer: Buffer.from(sitesCsv),
  });
  await page.getByTestId("button-import-preview-sites").click();
  await expect(page.getByTestId("import-preview-sample-sites")).toContainText("Workshop");
  await expect(page.getByTestId("import-preview-sample-sites")).toContainText("Store");
  await expect(page.getByTestId("button-import-run-sites")).toBeEnabled();
});

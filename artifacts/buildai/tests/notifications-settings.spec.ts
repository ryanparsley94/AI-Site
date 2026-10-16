import { test, expect } from "@playwright/test";

test("call notification setup defaults both outbound channels off and blocks test email until ready", async ({ page }) => {
  const outboundRequests: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && path.startsWith("/api/notifications/")) outboundRequests.push(path);
    if (path === "/api/auth/check") return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/company") return route.fulfill({ json: { id: 1, name: "Parsley Electrical", email: "owner@example.test", phone: "", timezone: "Europe/London", createdAt: "2026-01-01T00:00:00.000Z" } });
    if (path === "/api/notifications/settings") return route.fulfill({ json: {
      destination: "owner@example.test",
      internalOwnerEmail: "owner@example.test",
      ownerEmailEnabled: false,
      callerSmsEnabled: false,
      emailReady: false,
      smsReady: false,
      emailSenderConfigured: false,
      smsSenderConfigured: false,
    } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/settings?tab=notifications");
  await expect(page.getByText("Owner summary email · Not ready")).toBeVisible();
  await expect(page.getByText("Caller confirmation SMS · Not ready")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Automatic owner email" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Automatic owner email" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Automatic caller SMS" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Automatic caller SMS" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send internal test email" })).toBeDisabled();
  expect(outboundRequests).toEqual([]);
});

test("call details show saved summary separately from accurate email and SMS delivery states", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/check") return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/company") return route.fulfill({ json: { id: 1, name: "Parsley Electrical", email: "owner@example.test", phone: "", timezone: "Europe/London", createdAt: "2026-01-01T00:00:00.000Z" } });
    if (path === "/api/calls/10/voice-delivery") return route.fulfill({ json: { owner: "unconfigured", caller: "unconfigured", retryable: false } });
    if (path === "/api/calls/10") return route.fulfill({ json: {
      id: 10, callerName: "Ryan Parsley", callerPhone: "+447700900000", status: "unresolved",
      outcome: "Callback requested", duration: 12, assistantName: "Edward", notes: "Ryan needs a consumer unit inspection.",
      jobId: null, contactId: null, reviewed: true,
      transcript: [
        { speaker: "caller", text: "The consumer unit is faulty.", timestamp: 2 },
        { speaker: "assistant", text: "Edward will arrange a callback.", timestamp: 6 },
      ],
      createdAt: "2026-10-16T09:30:00.000Z",
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/calls/10");
  await expect(page.getByTestId("call-summary")).toHaveText("Ryan needs a consumer unit inspection.");
  await expect(page.getByText("Owner summary email:")).toBeVisible();
  await expect(page.getByText("Email not configured")).toBeVisible();
  await expect(page.getByText("Caller confirmation SMS:")).toBeVisible();
  await expect(page.getByText("SMS not configured")).toBeVisible();
  await expect(page.getByRole("link", { name: "Notification setup" })).toHaveAttribute("href", "/settings?tab=notifications");
});

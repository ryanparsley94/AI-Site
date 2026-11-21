import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/voice/elevenlabs/status") {
      return route.fulfill({ json: {
        configured: false,
        mode: "authenticated-pilot",
        message: "Connect ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in Replit Secrets first.",
      } });
    }
    await route.fulfill({ json: pathname === "/api/auth/check" ? { authenticated: true } : pathname === "/api/company" ? { name: "Pilot company" } : [] });
  });
});

test("pilot fails closed and provides exact missing setup names", async ({ page }) => {
  await page.goto("/assistants/elevenlabs-pilot");
  await expect(page.getByRole("heading", { name: "ElevenLabs receptionist pilot" })).toBeVisible();
  await expect(page.getByText(/ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID/)).toBeVisible();
  await expect(page.getByTestId("elevenlabs-start")).toBeDisabled();
  await expect(page.getByTestId("elevenlabs-stop")).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("permission denial never requests a billable signed URL", async ({ page }) => {
  let issued = 0;
  await page.route("**/api/voice/elevenlabs/status", (route) => route.fulfill({ json: {
    configured: true,
    mode: "authenticated-pilot",
    message: "Ready to connect.",
  } }));
  await page.route("**/api/voice/elevenlabs/session", (route) => {
    issued++;
    return route.fulfill({ json: { signedUrl: "wss://api.elevenlabs.io/test" } });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } },
    });
  });
  await page.goto("/assistants/elevenlabs-pilot");
  await page.getByTestId("elevenlabs-start").click();
  await expect(page.getByRole("alert")).toContainText("Permission denied");
  expect(issued).toBe(0);
});

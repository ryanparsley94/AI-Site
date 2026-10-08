import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/voice/")) return route.fallback();
    await route.fulfill({ json: path === "/api/auth/check" ? { authenticated: true } : path === "/api/company" ? { name: "Test contractor" } : path.includes("count") ? { count: 0 } : [] });
  });
  await page.addInitScript(() => {
    window.speechSynthesis.speak = () => {};
  });
});

test("collapsed global control, text command and clearing on close", async ({ page }) => {
  let commands = 0;
  await page.route("**/api/voice/command", async route => {
    commands++;
    expect(route.request().postDataJSON().transcript).toBe("Today's schedule");
    await route.fulfill({ json: { action: "schedule", spokenResponse: "No active jobs today.", navigateTo: "/jobs" } });
  });
  await page.goto("/");
  await expect(page.getByTestId("panel-voice")).toHaveCount(0);
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("input-voice-text").fill("Today's schedule");
  await page.getByTestId("button-voice-send").click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId("text-voice-response")).toContainText("No active jobs today");
  expect(commands).toBe(1);
  await page.getByTestId("button-voice-close").click();
  await page.getByTestId("button-voice-open").click();
  await expect(page.getByTestId("text-voice-response")).toHaveCount(0);
  await expect(page.getByTestId("input-voice-text")).toHaveValue("");
});

test("photo draft reaches editable quote rows without storing the image or command", async ({ page }) => {
  await page.route("**/api/voice/command", async route => {
    expect(route.request().postDataJSON().image).toMatch(/^data:image\/png;base64,/);
    await route.fulfill({ json: { action: "quote_draft", spokenResponse: "Review your material draft.", navigateTo: "/quotes", quoteDraft: [{ name: "Copper pipe", quantity: 20, unit: "metres" }] } });
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("input-voice-photo").setInputFiles({
    name: "materials.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVwAAAABJRU5ErkJggg==", "base64"),
  });
  await page.getByTestId("button-voice-send").click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.locator('input[value="Copper pipe"]')).toBeVisible();
  await expect(page.locator('input[value="20"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="input-cost-"]').first()).toHaveValue("0");
  await expect(page.locator('[data-testid^="input-sell-"]').first()).toHaveValue("0");
  await expect(page.getByText("Photo draft —", { exact: false })).toBeVisible();
  const stored = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
  expect(stored.join("")).not.toContain("Copper pipe");
  expect(stored.join("")).not.toContain("data:image");
});

test("permission denied is visible and a rapid release never sends", async ({ page }) => {
  let commands = 0;
  await page.route("**/api/voice/command", async route => { commands++; await route.fulfill({ json: {} }); });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("button-voice-hold").dispatchEvent("pointerdown", { pointerId: 1 });
  await expect(page.getByTestId("text-voice-error")).toContainText("denied");
  expect(commands).toBe(0);
});

test("release before permission resolves stops tracks and does not submit", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).stopped = false;
    navigator.mediaDevices.getUserMedia = async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return { getTracks: () => [{ stop: () => { (window as any).stopped = true; } }] } as unknown as MediaStream;
    };
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("button-voice-hold").dispatchEvent("pointerdown", { pointerId: 1 });
  await page.getByTestId("button-voice-hold").dispatchEvent("pointerup", { pointerId: 1 });
  await expect.poll(() => page.evaluate(() => (window as any).stopped)).toBe(true);
  await expect(page.getByTestId("button-voice-hold")).toContainText("Hold to speak");
});

test("recording fallback transcribes on release and sends only once", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = undefined;
    (window as any).webkitSpeechRecognition = undefined;
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop: () => {} }] }) as unknown as MediaStream;
    (window as any).MediaRecorder = class {
      state = "inactive"; mimeType = "audio/webm";
      ondataavailable: any; onstop: any;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["mock audio"]) });
        this.onstop?.();
      }
    };
  });
  let commands = 0;
  await page.route("**/api/voice/transcribe", route => route.fulfill({ json: { transcript: "Check outstanding invoices" } }));
  await page.route("**/api/voice/command", route => {
    commands++;
    expect(route.request().postDataJSON().transcript).toBe("Check outstanding invoices");
    return route.fulfill({ json: { action: "outstanding_invoices", spokenResponse: "No unpaid invoices." } });
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("button-voice-hold").dispatchEvent("pointerdown", { pointerId: 1 });
  await expect(page.getByTestId("button-voice-hold")).toContainText("Listening");
  await page.getByTestId("button-voice-hold").dispatchEvent("pointerup", { pointerId: 1 });
  await expect(page.getByTestId("text-voice-response")).toContainText("No unpaid invoices");
  expect(commands).toBe(1);
});

test("unauthorised command explains how to sign in and does not retry", async ({ page }) => {
  let commands = 0;
  await page.route("**/api/voice/command", route => {
    commands++;
    return route.fulfill({ status: 401, json: { error: "Unauthorised" } });
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("input-voice-text").fill("Send invoice for Smithson");
  await page.getByTestId("button-voice-send").click();
  await expect(page.getByTestId("text-voice-error")).toContainText("Sign in as admin in Settings");
  expect(commands).toBe(1);
});

test("British Web Speech recognition sends on release without transcription fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    (window as any).SpeechRecognition = class {
      lang = ""; onresult: any; onend: any;
      start() { if (this.lang !== "en-GB") throw new Error("Wrong speech language"); }
      stop() {
        this.onresult?.({ results: [[{ transcript: "Mark Smithson job complete" }]] });
        this.onend?.();
      }
      abort() {}
    };
  });
  let commands = 0;
  await page.route("**/api/voice/transcribe", () => { throw new Error("Should use browser recognition"); });
  await page.route("**/api/voice/command", route => {
    commands++;
    expect(route.request().postDataJSON().transcript).toBe("Mark Smithson job complete");
    return route.fulfill({ json: { action: "complete_job", spokenResponse: "Smithson job is complete." } });
  });
  await page.goto("/jobs");
  await page.getByTestId("button-voice-open").click();
  await page.getByTestId("button-voice-hold").dispatchEvent("keydown", { key: " " });
  await expect(page.getByTestId("button-voice-hold")).toContainText("Listening");
  expect(commands).toBe(0);
  await page.getByTestId("button-voice-hold").dispatchEvent("keyup", { key: " " });
  await expect(page.getByTestId("text-voice-response")).toContainText("Smithson job is complete");
  expect(commands).toBe(1);
});

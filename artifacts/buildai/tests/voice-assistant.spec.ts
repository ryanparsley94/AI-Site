import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/voice/")) return route.fallback();
    if (path === "/api/public-demo/options") return route.fulfill({ json: {
      businessName: "Parsley Electrical",
      bots: [{ id: 7, name: "Edward", defaultVoice: "cedar" }],
      displayNames: ["Ash", "James", "Sophie", "Emma", "Oliver", "Charlotte"],
      languagePreference: "British English · UK pronunciation (guided by instructions; voice accent can vary)",
    } });
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
  await page.goto("/jobs");
  await expect(page.getByTestId("panel-voice")).toHaveCount(0);
  await page.getByTestId("button-voice-open").click();
  const spokenVoice = page.getByLabel("Spoken voice");
  await expect(spokenVoice.locator("option")).toHaveCount(6);
  await expect(spokenVoice.locator("option").evaluateAll(options => options.map(option => option.textContent))).resolves.toEqual(["Edward", "Arthur", "George", "Charlotte", "Sophie", "Amelia"]);
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

test("embedded browser demo explains microphone denial and offers standalone open without starting Realtime", async ({ page }) => {
  let realtimeStarts = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("Denied by embedded browser", "NotAllowedError"); } },
    });
  });
  await page.route("**/api/public-demo/website-preview", route => route.fulfill({
    json: { preview: { companyName: "Parsley Electrical", trade: "Electrical" }, source: "parsleyelectrical.co.uk" },
  }));
  await page.route("**/api/public-demo/realtime-session", route => {
    realtimeStarts++;
    return route.fulfill({
      json: {
        clientSecret: "test-only",
        demoId: "test-demo",
        receptionistName: "Edward",
        assistantId: 7,
        voice: "cedar",
        openingGreeting: "Hello, you've reached Parsley Electrical. How can I help?",
      },
    });
  });
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Hear a Demo Call" }).click();
  await page.getByRole("button", { name: /Talk in your browser/ }).click();
  await page.getByTestId("input-business-website").fill("https://www.parsleyelectrical.co.uk");
  await page.getByTestId("button-preview-website").click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Meet Edward" }).click();
  await page.getByTestId("button-start-live-call").click();
  await expect(page.getByTestId("status-live-demo-error")).toContainText("browser or embedded preview did not grant microphone access");
  await expect(page.getByTestId("status-live-demo-error")).toContainText("Nothing was recorded and no call started");
  const standalone = page.getByRole("link", { name: "Open standalone demo" });
  await expect(standalone).toHaveAttribute("target", "_blank");
  await expect(standalone).toHaveAttribute("href", /https?:/);
  expect(realtimeStarts).toBe(0);
});

test("quota sample failure shows one clear diagnostic and makes no automatic retry", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/public-demo/sample-audio**", async route => {
    requests++;
    await route.fulfill({
      status: 503,
      json: {
        error: "OpenAI did not allow sample generation because the project may have reached its quota or billing limit.",
        category: "quota_or_billing",
        type: "insufficient_quota",
        code: "billing_hard_limit_reached",
        requestId: "req-safe-test",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Hear a Demo Call" }).click();
  await page.getByRole("button", { name: "Hear a sample" }).click();
  await expect(page.getByTestId("status-live-demo-error")).toContainText("quota or billing limit");
  await expect(page.getByText(/insufficient_quota.*billing_hard_limit_reached.*req-safe-test/)).toBeVisible();
  await expect(page.getByText("No automatic retry was made")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry sample once" })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(requests).toBe(1);
});

test("generated demo sample is reused by audio replay and never falls back to browser speech", async ({ page }) => {
  let sampleRequests = 0;
  let browserSpeech = 0;
  await page.route("**/api/public-demo/sample-audio**", async route => {
    sampleRequests++;
    await route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFFtestWAVE") });
  });
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).__speechCalls = 0;
    (window.speechSynthesis as any).speak = () => { (window as any).__speechCalls++; };
  });
  await page.getByRole("button", { name: "Hear a Demo Call" }).click();
  await page.getByRole("button", { name: "Hear a sample" }).click();
  const audio = page.locator('audio[aria-label="Play generated sample conversation"]');
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute("src", /^blob:/);
  expect(sampleRequests).toBe(1);
  await page.getByRole("button", { name: "Demo choices" }).click();
  await page.getByRole("button", { name: "Hear a sample" }).click();
  expect(sampleRequests).toBe(1);
  browserSpeech = await page.evaluate(() => (window as any).__speechCalls as number);
  expect(browserSpeech).toBe(0);
});

test("demo preview and callback use the receptionist's saved voice without a public voice override", async ({ page }) => {
  let previewUrl = "";
  let callbackBody: Record<string, unknown> | null = null;
  await page.route("**/api/public-demo/sample-audio?**", async route => {
    previewUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFFtestWAVE") });
  });
  await page.route("**/api/public-demo/phone-call", async route => {
    callbackBody = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { demoId: "test-demo", status: "queued", message: "Call requested for Sophie using the Edward voice.", assistantId: 7, assistantName: "Sophie", receptionistName: "Sophie", voice: "cedar" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Hear a Demo Call" }).click();
  await page.getByLabel("Demo receptionist name").selectOption("Sophie");
  await page.getByRole("button", { name: "Preview selected voice" }).click();
  await expect(page.locator('audio[aria-label="Voice preview for Sophie, Edward"]')).toBeVisible();
  expect(new URL(previewUrl).searchParams.get("assistantId")).toBe("7");
  expect(new URL(previewUrl).searchParams.has("voice")).toBe(false);
  expect(new URL(previewUrl).searchParams.get("receptionistName")).toBe("Sophie");
  await page.getByRole("button", { name: "Get a demo call" }).click();
  await page.getByLabel("Your phone number (international format)").fill("+447700900123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Call me now" }).click();
  await expect.poll(() => callbackBody).toMatchObject({ assistantId: 7, receptionistName: "Sophie", consent: true });
  expect(callbackBody).not.toHaveProperty("voice");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 960 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("phone assistant offers exactly six curated voices and requires saving before preview", async ({ page }) => {
  await page.goto("/assistants");
  await page.getByRole("button", { name: "New Assistant" }).click();
  await page.getByRole("button", { name: "Phone Operator" }).click();
  const select = page.locator('select[name="realtimeVoice"]');
  await expect(select.locator("option")).toHaveCount(6);
  await expect(select.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).resolves.toEqual(["cedar", "ash", "echo", "coral", "sage", "shimmer"]);
  await expect(select.locator("option").evaluateAll(options => options.map(option => option.textContent))).resolves.toEqual(["Edward", "Arthur", "George", "Charlotte", "Sophie", "Amelia"]);
  await expect(select).toHaveValue("cedar");
  await expect(page.getByRole("button", { name: "Save receptionist to preview" })).toBeDisabled();
});

test("Essex Voice Lab API requires an admin session", async ({ page }) => {
  await page.goto("/");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/voice/essex-design/status", { credentials: "include" });
    return response.status;
  });
  expect(status).toBe(401);
});

test("Essex Voice Lab auditions unverified provider samples without activating live calls", async ({ page }) => {
  let designRequests = 0;
  await page.route("**/api/voice/essex-design/status", route => route.fulfill({ json: { configured: true, activationEnabled: false, liveCallsChanged: false } }));
  await page.route("**/api/voice/essex-design", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    designRequests += 1;
    await route.fulfill({ json: {
      status: "unverified",
      warning: "Generated samples are candidates only. Listen and verify the accent with Ryan; this does not change any receptionist or live call.",
      text: "Sample greeting for evaluation.",
      previews: [1, 2, 3].map((n) => ({
        id: `candidate-${n}`,
        audioBase64: "dGVzdA==",
        mediaType: "audio/mpeg",
        durationSeconds: 2,
        verified: false,
        liveEnabled: false,
      })),
    } });
  });
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Essex Voice Lab" }).click();
  await expect(page.getByText("Candidates are unverified")).toBeVisible();
  await page.getByRole("button", { name: "Generate 3 Essex voice candidates" }).click();
  await expect(page.getByLabel("Unverified Essex voice candidate 1")).toBeVisible();
  await expect(page.getByText("Unverified · audition only").first()).toBeVisible();
  await expect(page.getByText("this does not change any receptionist or live call.")).toBeVisible();
  expect(designRequests).toBe(1);
});

test.describe("mobile receptionist voice editing", () => {
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("editing a phone assistant keeps an unsaved voice, previews it, and saves it", async ({ page }) => {
  let persistedVoice = "cedar";
  let previewRequest: Record<string, unknown> | null = null;
  let saveRequest: Record<string, unknown> | null = null;
  const assistant = () => ({
    id: 7,
    name: "Edward",
    type: "phone",
    voice: persistedVoice,
    realtimeVoice: persistedVoice,
    personality: "professional",
    greeting: "Hello, thanks for calling.",
    instructions: "",
    active: true,
    callsHandled: 0,
    jobsBooked: 0,
    twilioPhoneNumber: null,
    businessName: "Parsley Electrical",
    twilioVoice: "Polly.Amy-Neural",
    receptionistStyle: "Warm and professional.",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  await page.route("**/api/assistants", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: [assistant()] });
    return route.fallback();
  });
  await page.route("**/api/assistants/7", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: assistant() });
    if (route.request().method() === "PATCH") {
      saveRequest = route.request().postDataJSON();
      persistedVoice = String(saveRequest.realtimeVoice);
      return route.fulfill({ json: { ...assistant(), ...saveRequest } });
    }
    return route.fallback();
  });
  await page.route("**/api/assistants/voice-preview", async route => {
    previewRequest = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from("test-audio") });
  });

  await page.goto("/assistants");
  await page.getByRole("button", { name: "Edit" }).click();

  const voicePicker = page.locator('select[name="realtimeVoice"]');
  const pickerBox = await voicePicker.boundingBox();
  expect(pickerBox).not.toBeNull();
  expect(pickerBox!.width).toBeGreaterThanOrEqual(280);
  expect(pickerBox!.height).toBeGreaterThanOrEqual(44);
  await voicePicker.tap();
  await voicePicker.selectOption("ash");
  await expect(voicePicker).toHaveValue("ash");
  await expect(page.getByRole("status")).toContainText("Unsaved preview only");
  await expect(page.getByRole("button", { name: "Preview unsaved choice" })).toBeEnabled();

  await page.getByRole("button", { name: "Preview unsaved choice" }).click();
  await expect.poll(() => previewRequest).toMatchObject({ assistantId: 7, voice: "ash" });
  expect(persistedVoice).toBe("cedar");

  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(() => saveRequest).toMatchObject({ voice: "ash", realtimeVoice: "ash" });
  expect(persistedVoice).toBe("ash");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator('select[name="realtimeVoice"]')).toHaveValue("ash");
});
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

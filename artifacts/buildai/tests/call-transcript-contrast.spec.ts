import { test, expect } from "@playwright/test";

const transcript = [
  { speaker: "caller", text: "Hi, this is Ryan Parsley. We need help with a faulty consumer unit.", timestamp: 2 },
  { speaker: "assistant", text: "Of course, Ryan. I can take a few details and arrange a callback.", timestamp: 6 },
] as const;

test("call transcript stays legible in light and dark themes on mobile and desktop", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/check") return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/company") return route.fulfill({ json: { name: "Parsley Electrical" } });
    if (path === "/api/calls/10") {
      return route.fulfill({ json: {
        id: 10,
        callerName: "Ryan Parsley",
        callerPhone: "+447700900123",
        status: "unresolved",
        outcome: "Callback requested",
        duration: 12,
        assistantName: "Edward",
        notes: "",
        jobId: null,
        contactId: null,
        reviewed: true,
        transcript,
        createdAt: "2026-10-16T09:30:00.000Z",
      } });
    }
    if (path === "/api/calls/10/voice-delivery") {
      return route.fulfill({ json: { owner: "unconfigured", caller: "unconfigured", retryable: false } });
    }
    return route.fulfill({ json: [] });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/calls/10");
    await expect(page.getByText("Hi, this is Ryan Parsley. We need help with a faulty consumer unit.").first()).toBeVisible();
    await expect(page.getByText("Of course, Ryan. I can take a few details and arrange a callback.").first()).toBeVisible();
    await expect(page.getByText("Ryan Parsley", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Edward", { exact: true }).last()).toBeVisible();
    const bubbleBounds = await page.locator(".flex.min-w-0.gap-3").evaluateAll(bubbles =>
      bubbles.map(bubble => {
        const { left, right } = bubble.getBoundingClientRect();
        return { left, right };
      }),
    );
    expect(bubbleBounds.length).toBe(2);
    expect(bubbleBounds.every(bounds => bounds.left >= 0 && bounds.right <= viewport.width)).toBe(true);

    for (const theme of ["light", "dark"]) {
      await page.evaluate(themeName => {
        document.documentElement.classList.toggle("dark", themeName === "dark");
      }, theme);

      const contrast = await page.locator(".flex.min-w-0.gap-3").evaluateAll(bubbles => {
        const toRgb = (color: string) => {
          const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
          if (color.startsWith("rgb")) return values.slice(0, 3);
          const lightness = values[0];
          const isLch = color.startsWith("oklch");
          const a = isLch ? values[1] * Math.cos(values[2] * Math.PI / 180) : values[1];
          const b = isLch ? values[1] * Math.sin(values[2] * Math.PI / 180) : values[2];
          const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
          const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
          const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
          return [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
          ].map(channel => {
            const clamped = Math.max(0, Math.min(1, channel));
            return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055);
          });
        };
        const luminance = (color: string) => {
          const channels = toRgb(color);
          const linear = channels.map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        return bubbles.map(bubble => {
          const background = getComputedStyle(bubble.querySelector("div.rounded-xl")!).backgroundColor;
          const texts = [...bubble.querySelectorAll("span, p")];
          return texts.map(text => {
            const foreground = getComputedStyle(text).color;
            const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            return {
              text: text.textContent,
              foreground,
              background,
              ratio: (lighter + 0.05) / (darker + 0.05),
            };
          });
        }).flat();
      });

      expect(contrast.length).toBeGreaterThanOrEqual(6);
      expect(contrast.every(pair => pair.ratio >= 4.5), `${theme} ${viewport.width}px: ${JSON.stringify(contrast)}`).toBe(true);
    }
  }
});

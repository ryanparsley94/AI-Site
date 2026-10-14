import { test, expect } from "@playwright/test";

for (const width of [320, 390, 767]) {
  test(`mobile navigation reaches FAQ at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    expect(await page.locator("header").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await toggle.click();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    for (const name of ["Features", "How it Works", "Pricing", "FAQ"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await page.evaluate(() => {
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        (window as any).__scrollOptions = options;
        original.call(this, options);
      };
    });
    await nav.getByRole("link", { name: "FAQ", exact: true }).click();
    await expect(nav).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#faq$/);
    expect(await page.evaluate(() => (window as any).__scrollOptions.behavior)).toBe("smooth");
    await expect.poll(() => page.locator("#faq").evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(96);
    await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeInViewport();
    await toggle.click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "FAQ", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(nav).toHaveCount(0);
  });
}

test("desktop keeps the existing FAQ navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
  await expect(page.locator("header").getByRole("link", { name: "FAQ", exact: true })).toBeVisible();
});

/* Tooltips open under their own button and stay on screen; the dialogs open and
   close; nothing scrolls sideways on a phone. */

import { expect, test } from "@playwright/test";
import { open } from "./helpers";

for (const width of [1440, 767, 375, 320]) {
  test(`every tooltip sits under its button and on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const buttons = page.locator(".info button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let k = 0; k < count; k++) {
      const button = buttons.nth(k);
      await button.scrollIntoViewIfNeeded();
      await button.hover();
      await page.waitForTimeout(50);  // placed a frame after it shows
      const r = await button.evaluate((el) => {
        const b = el.getBoundingClientRect(), p = el.parentElement!.querySelector(".pop")!.getBoundingClientRect();
        return { gap: p.top - b.bottom, above: b.top - p.bottom, left: p.left, right: p.right, top: p.top, bottom: p.bottom,
          vw: innerWidth, vh: innerHeight, centred: p.left <= b.left && p.right >= b.right };
      });
      const label = await button.getAttribute("aria-label");
      expect(r.left, label!).toBeGreaterThanOrEqual(0);
      expect(r.right, label!).toBeLessThanOrEqual(r.vw);
      expect(r.top, label!).toBeGreaterThanOrEqual(0);
      expect(r.bottom, label!).toBeLessThanOrEqual(r.vh);
      expect(Math.round(r.gap) === 8 || Math.round(r.above) === 8, label!).toBe(true);
      expect(r.centred, label!).toBe(true);
      await page.mouse.move(0, 0);
    }
  });
}

test("both dialogs open from their links and close", async ({ page }) => {
  await open(page);
  for (const [name, id] of [["How are these calculations made?", "methods"], ["What limitations exist?", "limits"]]) {
    const dialog = page.locator("#" + id);
    await page.getByRole("button", { name }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("nothing scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

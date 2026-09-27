/* The wealth slider, the two settings and the Show as toggle each change the answer. */

import { expect, test } from "@playwright/test";
import { open, selectSomeSquare, tileValues } from "./helpers";

const setSlider = (page: import("@playwright/test").Page, v: number) =>
  page.locator("#pct").evaluate((el: HTMLInputElement, v) => {
    el.value = String(v); el.dispatchEvent(new Event("input"));
  }, v);

test("the wealth slider narrows the areas included, poorest first", async ({ page }) => {
  await open(page);
  const areas = async () => Number((await page.locator("#cnt").innerText()).match(/in ([\d,]+) areas/)![1].replace(/,/g, ""));
  const everyone = await areas();
  await setSlider(page, 20);
  await expect(page.locator("#pctOut")).toHaveText("Poorest 20%");
  const poorest = await areas();
  expect(poorest).toBeGreaterThan(0);
  expect(poorest).toBeLessThan(everyone);
});

test("household members and phone sharing raise the phone share", async ({ page }) => {
  await open(page);
  const phone = async () => parseInt((await tileValues(page))[0], 10);
  const own = await phone();
  await page.click('#hhSeg [data-b="hh_mobile_phone"]');
  const household = await phone();
  expect(household).toBeGreaterThan(own);
  await page.click('#kSeg [data-k="2"]');
  expect(await phone()).toBeGreaterThan(household);
  await expect(page.locator('#kSeg [data-k="2"]')).toHaveAttribute("aria-pressed", "true");
});

test("Show as switches between percentages and head counts", async ({ page }) => {
  await open(page);
  expect((await tileValues(page)).every((v) => /^\d+%$/.test(v))).toBe(true);
  await page.click('#unitSeg [data-u="n"]');
  expect((await tileValues(page)).every((v) => /^[\d.]+[kM]?$/.test(v))).toBe(true);
});

test("selecting a square swaps the slider for its heading without moving the tiles", async ({ page }) => {
  await open(page);
  const top = () => page.locator("#big").evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  await selectSomeSquare(page);
  await expect(page.locator("#sliderBox")).toBeHidden();
  await expect(page.locator("#selName")).toContainText("people in this 2.4 km area");
  expect(await top()).toBe(before);

  await page.keyboard.press("Escape");
  await expect(page.locator("#selbar")).toBeHidden();
  await expect(page.locator("#sliderBox")).toBeVisible();
});

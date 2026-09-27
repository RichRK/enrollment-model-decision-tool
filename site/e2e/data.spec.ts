/* The figures on the page are the pipeline's figures: every total is recomputed
   here from regions.json and squares.json and compared with what renders. */

import { expect, test } from "@playwright/test";
import { BASES, everyoneTotals, fmt, open, regions, squares, tileValues } from "./helpers";

test("everyone's totals match the survey rates and WorldPop counts", async ({ page }) => {
  await open(page);
  await page.click('#unitSeg [data-u="n"]');
  for (const basis of BASES) {
    await page.click(`#hhSeg [data-b="${basis}"]`);
    for (const share of [0, 1, 2]) {
      await page.click(`#kSeg [data-k="${share}"]`);
      const t = everyoneTotals(basis, share);
      expect(await tileValues(page), `${basis}, ${share} others`).toEqual([fmt(t.phone), fmt(t.inPerson)]);
    }
  }
  const all = everyoneTotals("phone_own", 0).all;
  await expect(page.locator("#cnt")).toHaveText(
    `${fmt(all)} people in ${squares.squares.length.toLocaleString("en")} areas`);
});

test("a square outside every survey region counts in neither tile", async () => {
  // Missing means missing: no national or neighbouring figure is substituted.
  const outside = (squares.squares as number[][]).filter((s) => s[4] < 0);
  expect(outside.length).toBeGreaterThan(0);
  const t = everyoneTotals("phone_own", 0);
  const outsidePop = outside.reduce((a, s) => a + s[5], 0);
  expect(Math.round(t.all - t.phone - t.inPerson)).toBe(outsidePop);
});

test("the dialogs quote figures computed from the data", async ({ page }) => {
  await open(page);
  const covered = (squares.squares as number[][]).reduce((a, s) => a + s[5], 0);
  const uncovered = squares.pop_total - covered;

  await page.getByRole("button", { name: "What limitations exist?" }).click();
  const limits = page.locator("#limits");
  await expect(limits).toContainText(`about ${Math.round((uncovered / squares.pop_total) * 100)}% of ${regions.country}'s people`);
  await expect(limits).toContainText(`(${(uncovered / 1e6).toFixed(1)}M)`);
  await limits.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "How are these calculations made?" }).click();
  const methods = page.locator("#methods");
  await expect(methods).toContainText(`at most ${regions.regions.length * 5} values`);
  await expect(methods).toContainText(`DHS ${regions.sources.dhs.survey_year}`);
});

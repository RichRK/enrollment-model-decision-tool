/* Missing means missing. The project's central claim, and the one regression
 * here that would not be cosmetic: a substituted or interpolated value would
 * reproduce exactly the error the tool exists to expose.
 */

import { expect, test } from "@playwright/test";
import { closeDrawer, distortionColumn, open, openFromTable, pickBasis } from "./helpers";
import {
  BASES, MISSING, data, noAnswer, noAnswerText, quintileRows, regionWithSuppressedCell,
  suppressFloor, type Basis,
} from "./regions";

test("the regions shown as dashes are exactly the regions with no value", async ({ page }) => {
  await open(page);

  for (const basis of BASES) {
    await pickBasis(page, basis);
    const column = await distortionColumn(page);
    const dashed = [...column].filter(([, v]) => v === MISSING).map(([name]) => name);
    // Set equality, not a count: a dash against the wrong region is the same
    // size of failure as a number against a region that has none.
    expect(dashed.sort()).toEqual(noAnswer(basis).slice().sort());
  }
});

test("a cell below the suppression floor renders a dash, never a number", async ({ page }) => {
  await open(page);

  for (const basis of BASES) {
    await pickBasis(page, basis);
    const region = regionWithSuppressedCell(basis);
    await openFromTable(page, region.name);

    const cells = quintileRows(region, basis);
    const rows = page.locator('[data-bind="drawer-body"] .qwrap .qrow');
    await expect(rows).toHaveCount(cells.length);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const value = rows.nth(i).locator(".qv");
      if (cell.cases_unweighted < suppressFloor) {
        // Below the floor -- suppressed, or a quintile the survey never
        // sampled. Both read as missing; neither may read as a number.
        await expect(value).toHaveText(MISSING);
      } else {
        await expect(value).toHaveText(cell.value!.toFixed(1) + "%");
      }
      // The unweighted count travels with every cell all the way to the bar, so
      // a reader can see what the dash is standing in for.
      await expect(rows.nth(i).locator(".qn"))
        .toHaveText("n=" + cell.cases_unweighted + (cell.flagged ? " ⚠" : ""));
    }

    await closeDrawer(page);
  }
});

test("the notes are readable without JavaScript", async ({ browser }) => {
  // No page.evaluate() and no expanding anywhere below: with scripting off, only
  // Playwright's own isolated world runs. toHaveText reads textContent, which is
  // there whether or not the <details> around it is open.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  // The page says so itself, so it has to be true.
  await expect(page.locator("noscript .panel.warn")).toBeVisible();

  // And the half that needs the script stays out of the way rather than
  // rendering as an empty shell -- .article[hidden] in styles.css.
  await expect(page.locator('[data-bind="app"]')).toBeHidden();

  /* Notes.astro renders these at build time on the headline indicator, and
     notes.ts overwrites them once the script runs. The promise is that the
     script REPLACES this content rather than supplying it. */
  const built = data.constants.headline_indicator as Basis;
  const notes = noAnswerText(built);
  await expect(page.locator('[data-bind="noanswer-count"]')).toHaveText(notes.count);
  await expect(page.locator('[data-bind="noanswer-have"]')).toHaveText(notes.have);
  await expect(page.locator('[data-bind="noanswer-list"] li')).toHaveCount(noAnswer(built).length);

  await context.close();
});

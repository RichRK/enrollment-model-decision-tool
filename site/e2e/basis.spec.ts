/* The basis selector, and the four surfaces that have to move with it.
 *
 * One test rather than four, deliberately: the failure this guards against is
 * surfaces DISAGREEING with each other, and it has happened -- the drawer's
 * distortion block stayed pinned to the household indicator while the verdict
 * sentence beside it followed the selector. Split across four tests, a partial
 * regression passes three of them.
 */

import { expect, test } from "@playwright/test";
import {
  closeDrawer, distortionColumn, expandDetails, notesDetails, open, openFromTable, pickBasis,
} from "./helpers";
import { BASES, MISSING, distortionText, gradient, noAnswer, noAnswerText, regionWithValueEverywhere } from "./regions";

test("changing the basis moves every region-level surface together", async ({ page }) => {
  await open(page);

  const region = regionWithValueEverywhere();
  const captions: string[] = [];
  const headings: string[] = [];

  for (const basis of BASES) {
    await pickBasis(page, basis);

    /* 1. the table's distortion column */
    const column = await distortionColumn(page);
    expect(column).toEqual(distortionText(basis));

    /* 2. the notes' counts and list */
    const notes = noAnswerText(basis);
    await expandDetails(notesDetails(page));
    await expect(page.locator('[data-bind="noanswer-count"]')).toHaveText(notes.count);
    await expect(page.locator('[data-bind="noanswer-have"]')).toHaveText(notes.have);
    await expect(page.locator('[data-bind="noanswer-lack"]')).toHaveText(notes.lack);
    await expect(page.locator('[data-bind="noanswer-list"] li'))
      .toHaveCount(noAnswer(basis).length);

    /* The cross-check that would have caught the original bug: the notes count
       the regions with no answer, the table draws them as dashes, and the two
       are the same fact rendered twice. */
    const dashes = [...column.values()].filter((v) => v === MISSING).length;
    expect(dashes).toBe(Number(notes.lack));

    /* 3. the caption under "Who it excludes" */
    captions.push((await page.locator('[data-bind="dist-caption"]').innerText()).trim());

    /* 4. the drawer's distortion figure and its heading. Opened from the table
       so the map-focus transition stays out of it, and opened AFTER the basis
       is chosen -- the selector sits in .copy, and clicking it with the drawer
       open is a click-away that would dismiss the drawer. */
    await openFromTable(page, region.name);
    const expected = gradient(region, basis)!.targeting_distortion!;
    await expect(page.locator('[data-bind="drawer-body"] .sh-dnum'))
      .toHaveText(expected.toFixed(2));
    headings.push((await page.locator('[data-bind="drawer-body"] h4.sh-sub').innerText()).trim());
    await closeDrawer(page);
  }

  /* Neither label may be pinned to a fixed indicator: each has to say something
     different under a different basis. The wording itself is prose and is not
     asserted -- only that it moved. */
  expect(new Set(captions).size).toBe(BASES.length);
  expect(new Set(headings).size).toBe(BASES.length);
});

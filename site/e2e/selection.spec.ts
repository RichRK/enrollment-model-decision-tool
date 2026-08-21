/* Where a selection came from decides what the page does with it. The two
 * origins are the thing most likely to be collapsed into one code path by a
 * future refactor, and the difference between them is a stated requirement
 * rather than a preference -- see the header of src/scripts/focus.ts.
 */

import { expect, test } from "@playwright/test";
import { closeDrawer, expandDetails, open, openFromMap, tableDetails, tableRow } from "./helpers";
import { regionWithValueEverywhere } from "./regions";

const REGION = regionWithValueEverywhere().name;

test("a map-origin selection hands the page's width to the map, and gives it back", async ({ page }) => {
  await open(page);

  const app = page.locator('[data-bind="app"]');
  const copy = page.locator('[data-bind="copy"]');
  const mapcol = page.locator('[data-bind="mapcol"]');
  const html = page.locator("html");

  // Horizontal only: the selection scrolls the page, and only the transform is
  // under test here.
  const restLeft = (await mapcol.boundingBox())!.x;

  const shape = await openFromMap(page, REGION);

  await expect(app).toHaveClass(/map-focus/);
  await expect(copy).toHaveCSS("opacity", "0");
  await expect(copy).toHaveAttribute("inert");
  // Lands only once the smooth scroll has settled -- the deferred half of
  // select() in app.ts. Auto-retrying assertions wait it out.
  await expect(html).toHaveClass(/drawer-open/);
  await expect.poll(async () => (await mapcol.boundingBox())!.x).toBeLessThan(restLeft);

  await closeDrawer(page);

  await expect(app).not.toHaveClass(/map-focus/);
  await expect(copy).toHaveCSS("opacity", "1");
  await expect(copy).not.toHaveAttribute("inert");
  await expect.poll(async () => (await mapcol.boundingBox())!.x).toBeCloseTo(restLeft, 0);
  // The shape that was clicked gets its focus back, not <body>.
  await expect(shape).toBeFocused();
});

test("a table-origin selection opens the drawer and moves nothing", async ({ page }) => {
  await open(page);

  const app = page.locator('[data-bind="app"]');
  const copy = page.locator('[data-bind="copy"]');
  const mapcol = page.locator('[data-bind="mapcol"]');

  await expandDetails(tableDetails(page));
  const row = tableRow(page, REGION);
  // Scrolled BEFORE the measurement, not by the click: Playwright scrolls to an
  // element as part of clicking it, and that scroll is the harness moving the
  // page, not the page moving itself.
  await row.scrollIntoViewIfNeeded();

  const restScroll = await page.evaluate(() => window.scrollY);
  const restLeft = (await mapcol.boundingBox())!.x;

  await row.click();

  await expect(page.locator('[data-bind="drawer-body"] .sh-head h3')).toHaveText(REGION);
  await expect(page.locator("html")).toHaveClass(/drawer-open/);

  // ...and none of the map-focus half happened.
  await expect(app).not.toHaveClass(/map-focus/);
  await expect(copy).toHaveCSS("opacity", "1");
  await expect(copy).not.toHaveAttribute("inert");
  expect((await mapcol.boundingBox())!.x).toBeCloseTo(restLeft, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(restScroll);
});

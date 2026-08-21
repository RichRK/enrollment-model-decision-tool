/* Below the breakpoint the drawer is a bottom sheet and the map-focus
 * transition is off entirely -- there is no width to hand over. focus.ts checks
 * the viewport itself rather than relying on the media query, so the two can
 * disagree, and this is what notices if they do.
 */

import { expect, test } from "@playwright/test";
import { open, openFromMap } from "./helpers";
import { regionWithValueEverywhere } from "./regions";

test.use({ viewport: { width: 375, height: 780 } });

test("nothing shifts or fades below the breakpoint", async ({ page }) => {
  await open(page);
  await openFromMap(page, regionWithValueEverywhere().name);

  await expect(page.locator('[data-bind="drawer"]')).toHaveClass(/open/);
  await expect(page.locator('[data-bind="app"]')).not.toHaveClass(/map-focus/);
  await expect(page.locator('[data-bind="copy"]')).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-bind="copy"]')).not.toHaveAttribute("inert");
  await expect(page.locator('[data-bind="mapcol"]')).toHaveCSS("transform", "none");
});

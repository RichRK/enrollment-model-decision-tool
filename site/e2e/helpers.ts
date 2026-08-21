/* Ways in, shared by the specs.
 *
 * Two traps these exist to absorb, both of which cost real time when they were
 * hit by hand:
 *  - The all-regions table and the no-answer notes are inside <details> that
 *    are CLOSED by default. Nothing in either is reachable until they are open.
 *  - A region on the map is an SVG <path>. The centre of its bounding box is
 *    routinely in the sea or on a neighbour, so a centred click selects the
 *    wrong region -- or nothing.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import type { Basis } from "./regions";

/** Open a <details> without clicking it. A click in the notes is also a
    click-away, which dismisses an open drawer -- expanding must not be able to
    close what the test is about to inspect. */
export async function expandDetails(host: Locator): Promise<void> {
  await host.evaluate((el: HTMLDetailsElement) => { el.open = true; });
}

/** The <details> holding the all-regions table. */
export function tableDetails(page: Page): Locator {
  return page.locator("details").filter({ has: page.locator('[data-bind="table-body"]') });
}

/** The <details> holding the "no distortion answer" notes. */
export function notesDetails(page: Page): Locator {
  return page.locator("details").filter({ has: page.locator('[data-bind="noanswer-list"]') });
}

/** Load the page and wait for the script to have taken over -- app.ts unhides
    the article as the last thing it does before its first render, so this is
    the page's own signal that it is ready rather than a timeout. */
export async function open(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-bind="app"]')).toBeVisible();
}

/** Choose a feasibility basis. Clicks the label, not the radio: the radio is
    `opacity: 0` under it and is not the thing a reader hits.

    Only safe while the drawer is closed and the map is not focused -- the
    selector lives in .copy, which a map-origin selection fades out and makes
    inert, and a click there would otherwise be a click-away that dismisses the
    drawer. Every spec picks the basis first for that reason. */
export async function pickBasis(page: Page, basis: Basis): Promise<void> {
  const radio = page.locator(`[data-bind="basis"] input[value="${basis}"]`);
  // The `has` locator resolves relative to each label, so it must not repeat the
  // [data-bind="basis"] ancestor -- that host is above the label, not inside it.
  await page.locator('[data-bind="basis"] label.opt')
    .filter({ has: page.locator(`input[value="${basis}"]`) }).click();
  await expect(radio).toBeChecked();
}

/** A region's shape on the primary map. Matched on the aria-label, which
    paintMaps() writes as "<name>: ...". */
export function mapShape(page: Page, name: string): Locator {
  return page.locator(`[data-bind="map"] path.rg[aria-label^="${name}: "]`);
}

/* A point that really is inside the shape. Samples the bounding box and keeps
   the hit nearest its centre, because Madagascar's regions are MultiPolygons
   and several of them do not contain their own centroid. */
async function pointInside(shape: Locator): Promise<{ x: number; y: number }> {
  return shape.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const steps = 11;
    let best: { x: number; y: number; d: number } | null = null;
    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        const x = r.left + (r.width * i) / steps;
        const y = r.top + (r.height * j) / steps;
        if (document.elementFromPoint(x, y) !== el) continue;
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    if (!best) throw new Error("no clickable point inside " + el.getAttribute("aria-label"));
    return { x: best.x, y: best.y };
  });
}

/** Select a region by clicking its shape on the map -- a real mouse click at a
    point inside the path, so the shape takes DOM focus exactly as it does for a
    reader. app.ts records that focus to give it back on close. */
export async function openFromMap(page: Page, name: string): Promise<Locator> {
  const shape = mapShape(page, name);
  await shape.scrollIntoViewIfNeeded();
  const { x, y } = await pointInside(shape);
  await page.mouse.click(x, y);
  await expect(page.locator('[data-bind="drawer-body"] .sh-head h3')).toHaveText(name);
  return shape;
}

/** The all-regions table row for a region. */
export function tableRow(page: Page, name: string): Locator {
  return page.locator('[data-bind="table-body"] tr')
    .filter({ has: page.locator(`td:first-child:text-is("${name}")`) });
}

/** Select a region from the all-regions table. Expands the accordion first, and
    scrolls the row into view BEFORE the caller measures anything: Playwright
    scrolls to an element as part of clicking it, which would otherwise be
    mistaken for the page moving under the reader. */
export async function openFromTable(page: Page, name: string): Promise<Locator> {
  await expandDetails(tableDetails(page));
  const row = tableRow(page, name);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(page.locator('[data-bind="drawer-body"] .sh-head h3')).toHaveText(name);
  return row;
}

/** Close the drawer the way a reader does. */
export async function closeDrawer(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).not.toHaveClass(/drawer-open/);
}

/** Every row of the all-regions table as [region, distortion cell]. */
export async function distortionColumn(page: Page): Promise<Map<string, string>> {
  await expandDetails(tableDetails(page));
  const rows = await page.locator('[data-bind="table-body"] tr').all();
  const out = new Map<string, string>();
  for (const row of rows) {
    const cells = row.locator("td");
    out.set((await cells.nth(0).innerText()).trim(), (await cells.nth(1).innerText()).trim());
  }
  return out;
}

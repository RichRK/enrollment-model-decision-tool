/* Ways in, and the expected figures, shared by the specs. Expected values are
   recomputed here from the pipeline's files, not copied from the page. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

const DATA_DIR = join(import.meta.dirname, "..", "..", "pipeline", "data");
const read = (name: string) => JSON.parse(readFileSync(join(DATA_DIR, name), "utf-8"));
export const regions = read("regions.json");
export const squares = read("squares.json");

export type Basis = "hh_mobile_phone" | "phone_own";
export const BASES: Basis[] = ["hh_mobile_phone", "phone_own"];

/** The page's number format, restated so a change to either is noticed. */
export const fmt = (v: number) =>
  v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + "M"
    : v >= 1e4 ? Math.round(v / 1e3) + "k"
    : v >= 1e3 ? (v / 1e3).toFixed(1) + "k"
    : String(Math.round(v));

/** People who could enroll by phone and in person, across every square. */
export function everyoneTotals(basis: Basis, share: number) {
  let phone = 0, all = 0, unknown = 0;
  for (const s of squares.squares as number[][]) {
    const [, , , , region, pop, fifth] = s;
    all += pop;
    const cell = region < 0 ? null : regions.regions[region].quintiles[basis].ownership_by_quintile[fifth];
    if (!cell || cell.suppressed || cell.value === null) { unknown += pop; continue; }
    phone += pop * Math.min(100, (Math.round(cell.value * 10) / 10) * (1 + share)) / 100;
  }
  return { phone, inPerson: all - unknown - phone, all };
}

/** Load the page and wait for the first render of the answer panel. */
export async function open(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#cnt")).not.toBeEmpty();
}

export const tileValues = (page: Page) => page.locator("#big .chip .v").allInnerTexts();

/** Click the map until a square is selected, scanning across its middle. The map
    is a canvas, so there is no element per square to click. */
export async function selectSomeSquare(page: Page): Promise<void> {
  const box = (await page.locator("#map").boundingBox())!;
  for (let f = 0.5; f < 0.8; f += 0.02) {
    await page.mouse.click(box.x + box.width * f, box.y + box.height * 0.5);
    if (await page.locator("#selbar").isVisible()) return;
  }
  throw new Error("no square found along the map's middle row");
}

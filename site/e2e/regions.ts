/* What the page should be showing, derived from the file it was built from.
 *
 * Nothing in this suite types a figure in by hand. src/pages/index.astro takes
 * the same approach at build time and records the reason there: hand-written
 * numbers stay correct right up until they quietly stop being, and nothing
 * tells you when. It also means a data refresh cannot turn the suite red for
 * the wrong reason -- the expectations move with the file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_PATH = join(import.meta.dirname, "..", "..", "pipeline", "data", "regions.json");

interface QuintileCell {
  quintile: string;
  value: number | null;
  cases_unweighted: number;
  flagged: boolean;
  suppressed: boolean;
  absent?: boolean;
}

interface Gradient {
  targeting_distortion: number | null;
  ownership_by_quintile: QuintileCell[];
  suppressed_quintiles: string[];
  pending_reason: string | null;
}

interface Region {
  region_id: string;
  name: string;
  quintiles?: Record<string, Gradient>;
}

interface Data {
  constants: { min_cases_suppress: number; min_cases_flag: number; headline_indicator: string };
  regions: Region[];
}

export const data = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as Data;

/** The em dash the page uses for "there is no value here". The one string in
    this suite asserted verbatim: here the exact character IS the contract. */
export const MISSING = "—";

/* The basis keys, in the order scenario.ts renders the radios. Only the keys --
   the names and descriptions beside them are prose and are not asserted. */
export const BASES = ["hh_mobile_phone", "phone_own_f"] as const;
export type Basis = (typeof BASES)[number];

/* Mirrors the word list in notes.ts and Notes.astro. A formatting convention
   rather than a figure, so duplicating it here is not duplicating a number --
   and without it a count pinned to the wrong basis reads "Four regions" where
   it should read "Five" and no assertion notices. */
const NUMBER_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten"];
const inWords = (n: number): string => NUMBER_WORD[n] ?? String(n);

export const regionCount = data.regions.length;

export function gradient(region: Region, basis: Basis): Gradient | null {
  return (region.quintiles || {})[basis] || null;
}

/** Every region's distortion cell as the page should render it, by region name. */
export function distortionText(basis: Basis): Map<string, string> {
  return new Map(data.regions.map((region) => {
    const d = gradient(region, basis)?.targeting_distortion ?? null;
    return [region.name, d === null ? MISSING : d.toFixed(2)];
  }));
}

/** The regions with no distortion answer on this basis -- the set the notes
    count and list, and the set the table shows as dashes. */
export function noAnswer(basis: Basis): string[] {
  return data.regions
    .filter((region) => (gradient(region, basis)?.targeting_distortion ?? null) === null)
    .map((region) => region.name);
}

/** The three per-basis strings the notes accordion carries. */
export function noAnswerText(basis: Basis): { count: string; have: string; lack: string } {
  const n = noAnswer(basis).length;
  return {
    count: inWords(n) + " region" + (n === 1 ? "" : "s"),
    have: (regionCount - n) + " of " + regionCount,
    lack: String(n),
  };
}

/** A region that has a distortion under every basis, so drawer assertions can
    read a number rather than the unavailable card. Picked, not named. */
export function regionWithValueEverywhere(): Region {
  const region = data.regions.find((r) =>
    BASES.every((b) => gradient(r, b)?.targeting_distortion != null));
  if (!region) throw new Error("no region has a targeting distortion under every basis");
  return region;
}

/** A region carrying at least one suppressed quintile cell, for the
    missing-means-missing check on the drawer's bars. */
export function regionWithSuppressedCell(basis: Basis): Region {
  const region = data.regions.find((r) => (gradient(r, basis)?.suppressed_quintiles || []).length > 0);
  if (!region) throw new Error("no region has a suppressed quintile cell on " + basis);
  return region;
}

/** The drawer's quintile rows for one region and basis: what each bar's value
    and case count should read. Row order is the file's, which is the order
    bars.ts draws. */
export function quintileRows(region: Region, basis: Basis): QuintileCell[] {
  return gradient(region, basis)?.ownership_by_quintile || [];
}

export const suppressFloor = data.constants.min_cases_suppress;

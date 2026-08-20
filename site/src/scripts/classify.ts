/* The decision itself. Pure: nothing here touches the DOM.
 *
 * Everything measured is precomputed by the pipeline. The only arithmetic on this
 * side is the cost comparison, because that has to respond to what the user types.
 */

import { absent } from "./format";
import { constant, data, state, type Region } from "./state";

export type VerdictKind = "remote" | "inperson" | "tipping" | "missing";

export interface Verdict {
  kind: VerdictKind;
  share: number | null;
  margin: number | null;
}

export interface Classified {
  region: Region;
  verdict: Verdict;
}

export const LABEL: Record<VerdictKind, string> = {
  remote: "Remote",
  inperson: "In person",
  tipping: "Near the line",
  missing: "No value",
};

export interface Basis {
  key: string;
  name: string;
  desc: string;
  /* Every label that describes the targeting distortion travels with the basis.
     The distortion is computed per channel -- there is a separate wealth
     breakdown behind each of these keys -- so a label written out at the point
     of use goes wrong the moment the reader changes the selector. They were
     written out, and the drawer went on saying "household phone" while the
     verdict sentence beside it had already switched to women's ownership. */
  heading: string;   // over the quintile bars in the drawer
  reaches: string;   // "...of everyone <reaches>"
  captionSub: string;  // under "Who it excludes" on the map
}

export const BASES: Basis[] = [
  {
    key: "hh_mobile_phone",
    name: "Household owns a mobile phone",
    desc: "The most generous reading, and an upper bound. It counts households " +
      "containing a phone, not people who can use one.",
    heading: "Household phone ownership by wealth quintile",
    reaches: "a household phone reaches",
    captionSub: "targeting distortion, household phone",
  },
  {
    key: "phone_own_f",
    name: "Woman personally owns a mobile phone",
    desc: "The binding constraint if the people being enrolled are women. " +
      "Substantially lower than the household figure in every region.",
    heading: "Women's own phone ownership by wealth quintile",
    reaches: "a woman's own phone reaches",
    captionSub: "targeting distortion, woman's own phone",
  },
];

/* The selected basis, never null: an unrecognised key falls back to the first
   entry rather than throwing, because a stale key must not take the page down. */
export function currentBasis(): Basis {
  return BASES.find((b) => b.key === state.basis) || BASES[0];
}

/* "Woman owns a phone and is literate" was offered as a third basis and is gone.
   It never moved the map: women's literacy exceeds women's phone ownership in
   every one of the 23 regions, so min(phone, literacy) is always just the phone
   figure and literacy never binds first. All it contributed was a wide pair of
   Frechet bounds around a number the phone basis already gave. The pipeline no
   longer computes it either -- see add_feasibility_bases() in pipeline/build.py. */

export function costRatio(): number | null {
  const remote = parseFloat((document.querySelector('[data-bind="cost-remote"]') as HTMLInputElement).value);
  const inperson = parseFloat((document.querySelector('[data-bind="cost-inperson"]') as HTMLInputElement).value);
  if (!isFinite(remote) || !isFinite(inperson) || inperson <= 0) return null;
  return remote / inperson;
}

/* Remote-first costs cost_remote for everyone plus cost_inperson for the share
   who cannot complete it. That beats all-in-person exactly when
      cost_remote + (1 - s) * cost_inperson  <  cost_inperson
   which reduces to  s > cost_remote / cost_inperson. */
export function classify(region: Region, r: number | null): Verdict {
  const value = region.feasibility_bases[state.basis];
  if (absent(value)) {
    return { kind: "missing", share: null, margin: null };
  }
  const s = value / 100;
  if (r === null) return { kind: "missing", share: s, margin: null };
  const margin = s - r;
  if (Math.abs(margin) <= constant("tipping_band")) {
    return { kind: "tipping", share: s, margin: margin };
  }
  return { kind: margin > 0 ? "remote" : "inperson", share: s, margin: margin };
}

/* One verdict per region, computed once per render and handed to every consumer.
   The summary, the maps, the table and the drawer all need the same answer; they
   used to each recompute it, so classify() ran four times per region. */
export function classifyAll(r: number | null): Classified[] {
  return data().regions.map((region) => ({ region: region, verdict: classify(region, r) }));
}

/* The targeting-distortion severity enum. One classifier, several consumers
   (the gradient hero numbers, the drawer hero, the table chips), all driven from
   thresholds that ship with the data. */
export function distortionClass(d: number | null | undefined): "ok" | "warn" | "bad" | "na" {
  if (absent(d)) return "na";
  if (d >= constant("distortion_alarm")) return "ok";
  if (d >= constant("distortion_warn")) return "warn";
  return "bad";
}

/* The quintile split is a judgement call recorded in pipeline/config.py and
   shipped in `constants`; the page used to restate its size as the English words
   "two" and "three" in four places, which would quietly become wrong if the split
   ever moved. */
const COUNT_WORD = ["zero", "one", "two", "three", "four", "five"];

export function groupWord(which: "bottom_group" | "top_group"): string {
  const n = constant(which).length;
  return COUNT_WORD[n] || String(n);
}

/* The data index.astro inlines, and the per-square score built from it. */

export type Basis = "hh_mobile_phone" | "phone_own";

export interface PageData {
  survey_year: number;
  names: string[];
  /** Region outlines in tile units: region -> polygon -> ring -> [x, y]. */
  outlines: number[][][][][];
  /** Phone rate (%) per basis, region and wealth fifth; null where withheld. */
  rates: Record<Basis, (number | null)[][]>;
  /** One entry per square, poorest first. region is -1 outside every region. */
  tx: number[];
  ty: number[];
  region: number[];
  pop: number[];
  fifth: number[];
}

export const DATA: PageData = JSON.parse(document.getElementById("page-data")!.textContent!);
export const n = DATA.pop.length;

/** Running population, poorest first, for the wealth slider's cut. */
export const cum = new Float64Array(n);
let running = 0;
for (let i = 0; i < n; i++) { running += DATA.pop[i]; cum[i] = running; }
export const covered = running;

/** Square index by tile, keyed tx * 20000 + ty. */
export const at = new Map<number, number>();
for (let i = 0; i < n; i++) at.set(DATA.tx[i] * 20000 + DATA.ty[i], i);

export interface Score { v: number; hi: number }

/** Share of a square's people (%) who could enroll by phone, and its upper
    range from the next-richer fifth's rate. `share` is how many people without
    a phone each owner also enrolls. null where there is no survey figure. */
export function score(i: number, basis: Basis, share: number): Score | null {
  const r = DATA.region[i];
  if (r < 0) return null;
  const rates = DATA.rates[basis][r], q = DATA.fifth[i], v = rates[q];
  if (v === null) return null;
  const up = rates[q + 1], m = 1 + share;
  return { v: Math.min(100, v * m), hi: Math.min(100, Math.max(v, up == null ? v : up) * m) };
}

export const regionName = (i: number) =>
  DATA.region[i] >= 0 ? DATA.names[DATA.region[i]] : "Outside survey regions";

export const fmt = (v: number) =>
  v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + "M"
    : v >= 1e4 ? Math.round(v / 1e3) + "k"
    : v >= 1e3 ? (v / 1e3).toFixed(1) + "k"
    : String(Math.round(v));
export const pc = (v: number) => Math.round(v * 100) + "%";

const FIFTH = ["poorest", "second-poorest", "middle", "second-richest", "richest"];

/** "Quintile: poorest ▢■▢▢▢ wealthiest", with square k filled. */
export const fifths = (k: number) =>
  '<b>Quintile:</b> poorest<span class="fifths" role="img" aria-label="' + FIFTH[k] + ' wealth fifth">' +
  [0, 1, 2, 3, 4].map((j) => "<i" + (j === k ? ' class="on"' : "") + "></i>").join("") + "</span>wealthiest";

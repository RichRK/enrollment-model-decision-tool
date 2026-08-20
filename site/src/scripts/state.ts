/* The shape of pipeline/data/regions.json, and the page's mutable state.
 *
 * The interfaces below describe the pipeline's output, which is the site's only
 * input. They are hand-written rather than generated because regions.json is
 * produced by a Python build in a sibling directory -- the two toolchains are
 * kept as siblings on purpose (see site/README.md) and neither generates code
 * into the other.
 */

/* ------------------------------------------------------------------ data */

export type Position = [number, number];
export type Ring = Position[];

export interface Geometry {
  type: "Polygon" | "MultiPolygon";
  // Polygon: Ring[]. MultiPolygon: Ring[][]. eachRing() in map.ts is the one
  // place that has to know the difference.
  coordinates: Ring[] | Ring[][];
}

export interface QuintileCell {
  quintile: string;
  value: number | null;
  cases_unweighted: number;
  // Null on any cell carrying no value -- suppressed or absent alike.
  denominator_weighted: number | null;
  flagged: boolean;
  suppressed: boolean;
  /* Present and true only where the survey sampled NOBODY in this region x
     quintile, so cases_unweighted is a true 0 rather than a thin count. A
     different thing from `suppressed`, and rendered differently: suppressed
     means the households exist and are too few to publish, absent means the
     survey holds none at all. Wealth quintiles are national, so the capital has
     no bottom-quintile households to measure. */
  absent?: boolean;
}

export interface PoolCell {
  quintile: string;
  pool_share: number;
  population_share: number;
}

/** A region's wealth breakdown for one indicator. The v2 core. */
export interface RegionGradient {
  targeting_distortion: number | null;
  targeting_distortion_bottom2: number | null;
  bottom_group_rate: number | null;
  top_group_rate: number | null;
  exclusion_gap: number | null;
  ownership_by_quintile: QuintileCell[];
  reachable_pool_composition: PoolCell[] | null;
  absent_quintiles: string[];
  suppressed_quintiles: string[];
  flagged_quintiles: string[];
  pending_reason: string | null;
}

export interface NationalQuintileCell {
  quintile: string;
  value: number | null;
  cases_unweighted: number;
  denominator_weighted: number;
  pool_share: number;
  population_share: number;
}

export interface NationalGradient {
  indicator_id: string;
  targeting_distortion: number;
  bottom_quintile_pool_share: number;
  bottom_quintile_population_share: number;
  bottom_group_rate: number;
  top_group_rate: number;
  exclusion_gap: number;
  by_quintile: NationalQuintileCell[];
}

export interface Region {
  region_id: string;
  name: string;
  geometry: Geometry;
  feasibility_bases: Record<string, number | null>;
  quintiles?: Record<string, RegionGradient>;
  pop_total: number | null;
  dhs_denominator_households: number | null;
  hh_mobile_phone: number | null;
  hh_electricity: number | null;
  phone_own_f: number | null;
  phone_own_m: number | null;
  literacy_f: number | null;
  literacy_m: number | null;
  mobile_money_f: number | null;
  mobile_money_m: number | null;
  bank_account_f: number | null;
  bank_account_m: number | null;
}

export interface Constants {
  bottom_group: string[];
  top_group: string[];
  quintiles: string[];
  distortion_alarm: number;
  distortion_warn: number;
  headline_indicator: string;
  min_cases_flag: number;
  min_cases_suppress: number;
  tipping_band: number;
  simplify_tolerance_deg: number;
}

export interface FieldMeta {
  label?: string;
  source?: string;
  vintage?: string;
  note?: string;
}

export interface Data {
  constants: Constants;
  country: string;
  fields: Record<string, FieldMeta>;
  generated: string;
  verified_on: string;
  schema_version: number;
  regions: Region[];
  national: {
    wealth_gradient: Record<string, NationalGradient>;
    wealth_gradient_withheld: Record<string, string>;
    findex: unknown;
    population: unknown;
  };
  sources: {
    dhs: { survey_id: string; survey_year: number; indicators: Record<string, string> };
    worldpop: { year: number; resolution: string; type: string };
  };
}

/* ----------------------------------------------------------------- state */

export type Mode = "verdict" | "distortion" | "compare";

export interface State {
  data: Data | null;
  basis: string;
  mode: Mode;
  sel: string | null;
  sortKey: string;
  sortDir: 1 | -1;
}

export const state: State = {
  data: null,
  basis: "hh_mobile_phone",
  mode: "verdict",
  sel: null,
  sortKey: "share",
  sortDir: -1,
};

export function setData(d: Data): void {
  state.data = d;
}

export function data(): Data {
  if (!state.data) throw new Error("region data has not been loaded");
  return state.data;
}

/* Every model threshold travels with the data, in regions.json's `constants`
   block, rather than being mirrored here by hand. They are judgement calls, they
   live in pipeline/config.py with their reasoning next to them, and a copy on this
   side could only ever drift out of date. */
export function constant<K extends keyof Constants>(name: K): Constants[K] {
  return data().constants[name];
}

/** A region's wealth breakdown for one indicator, or null if it has none. */
export function regionGradient(region: Region, key: string): RegionGradient | null {
  return (region.quintiles || {})[key] || null;
}

/** A region's headline (household phone) breakdown. */
export function headlineGradient(region: Region): RegionGradient | null {
  return regionGradient(region, constant("headline_indicator"));
}

/* The flat indicator fields on a region are addressed by key from the table, the
   drawer and the stat grid. Region is declared with those fields named rather
   than as an index signature, so that a typo in a field name is caught; this is
   the single documented cast that lets a runtime key through. */
export function stat(region: Region, key: string): number | null {
  return (region as unknown as Record<string, number | null>)[key] ?? null;
}

/** Where a selection came from. The two origins mean different things to the
    page: a click on the map hands the width to the map (see focus.ts), a click
    on the all-regions table opens the drawer and moves nothing, because that
    table sits far below the map and shifting the page under a reader looking at
    it is the exact failure the drawer was introduced to avoid. */
export type Origin = "map" | "table";

/* Actions the leaf renderers need but must not import from app.ts -- map.ts and
   table.ts both raise selection, and app.ts owns what selection does. Importing
   app.ts from them would close a module cycle; app.ts fills these in at start-up
   instead. */
export const actions = {
  select(_id: string, _origin: Origin): void {},
  render(): void {},
};

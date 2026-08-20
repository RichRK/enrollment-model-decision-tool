/* The maps. Two of them: the main one, and a second that only ever paints the
 * targeting-distortion layer and is shown side by side with the first in
 * "compare" mode. Both are built once from the same projection and repainted on
 * every render.
 *
 * The geometry ships inside regions.json and is projected here at runtime, as it
 * was before the redesign -- nothing about the projection changed, and the
 * comments in it document real Chromium behaviour, not style.
 */

import { $, absent, el, MISSING, share } from "./format";
import { LABEL, type Classified } from "./classify";
import {
  actions, basisGradient, data, state,
  type Geometry, type Region, type Ring,
} from "./state";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------------------------------------------------------- projection */

function eachRing(geometry: Geometry, fn: (ring: Ring) => void): void {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as Ring[]]
    : (geometry.coordinates as Ring[][]);
  polygons.forEach((polygon) => polygon.forEach(fn));
}

interface Projection {
  viewBox: string;
  pathFor(geometry: Geometry): string;
}

function makeProjection(regions: Region[]): Projection {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  regions.forEach((region) => {
    eachRing(region.geometry, (ring) => {
      ring.forEach((pt) => {
        if (pt[0] < b.x0) b.x0 = pt[0];
        if (pt[0] > b.x1) b.x1 = pt[0];
        if (pt[1] < b.y0) b.y0 = pt[1];
        if (pt[1] > b.y1) b.y1 = pt[1];
      });
    });
  });

  // Equirectangular, longitudes compressed by cos(mean latitude) so the country
  // is not stretched east-west. Adequate for one country at this size; nothing
  // here is measured off the map.
  const midLat = (b.y0 + b.y1) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const width = (b.x1 - b.x0) * kx;
  const height = b.y1 - b.y0;
  const pad = height * 0.02;

  function project(pt: [number, number]): [number, number] {
    return [(pt[0] - b.x0) * kx, b.y1 - pt[1]];
  }

  return {
    viewBox: [-pad, -pad, width + pad * 2, height + pad * 2].join(" "),
    pathFor(geometry: Geometry): string {
      const d: string[] = [];
      eachRing(geometry, (ring) => {
        ring.forEach((pt, i) => {
          const p = project(pt);
          d.push((i === 0 ? "M" : "L") + p[0].toFixed(4) + " " + p[1].toFixed(4));
        });
        d.push("Z");
      });
      return d.join("");
    },
  };
}

/* ---------------------------------------------------------------- build */

type Shapes = Record<string, SVGPathElement>;

function buildMapInto(host: HTMLElement, projection: Projection, label: string): Shapes {
  const regions = data().regions;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", projection.viewBox);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", label);
  // Chromium puts an <svg> carrying a role into the sequential tab order itself,
  // which costs a keyboard user one dead stop before the regions (two, in
  // compare). -1 keeps it focusable programmatically and out of the Tab walk.
  svg.setAttribute("tabindex", "-1");

  const shapes: Shapes = {};
  regions.forEach((region) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", projection.pathFor(region.geometry));
    path.setAttribute("class", "rg");
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    // Capture the id, not the region: these listeners outlive this loop for the
    // life of the page, and closing over the whole record would pin every
    // region's geometry -- the bulk of the payload -- in memory for no reason.
    const id = region.region_id;
    path.addEventListener("click", () => actions.select(id, "map"));
    path.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        actions.select(id, "map");
      }
    });
    path.addEventListener("mouseenter", () => hover(id));
    path.addEventListener("mouseleave", () => hover(null));
    path.appendChild(document.createElementNS(SVG_NS, "title"));
    svg.appendChild(path);
    shapes[id] = path;
  });

  /* Keyboard focus ring, drawn rather than outlined.
   *
   * CSS `outline` cannot be used here at all: Chromium resolves it in SVG user
   * units, so both `auto` and an explicit `2px` render as a ~100-240 px halo
   * against this viewBox. These two paths are appended last so they paint above
   * every region, and their stroke widths use vector-effect, so they really are
   * in screen pixels. White halo under a dark edge reads against both fills. */
  const halo = document.createElementNS(SVG_NS, "path");
  halo.setAttribute("class", "focus-ring focus-ring--halo");
  const edge = document.createElementNS(SVG_NS, "path");
  edge.setAttribute("class", "focus-ring focus-ring--edge");
  svg.appendChild(halo);
  svg.appendChild(edge);

  svg.addEventListener("focusin", (e: FocusEvent) => {
    // Only for keyboard focus. A mouse click focuses the path too, and a ring
    // there would fight with the selection stroke it already gets.
    const target = e.target as Element | null;
    if (target && target.matches && target.matches(".rg:focus-visible")) {
      const d = target.getAttribute("d") || "";
      [halo, edge].forEach((ring) => {
        ring.setAttribute("d", d);
        ring.setAttribute("data-shown", "true");
      });
    }
  });
  svg.addEventListener("focusout", () => {
    [halo, edge].forEach((ring) => ring.setAttribute("data-shown", "false"));
  });

  host.innerHTML = "";
  host.appendChild(svg);
  return shapes;
}

let shapes: Shapes = {};
let shapes2: Shapes = {};

export function buildMaps(): void {
  const projection = makeProjection(data().regions);
  const count = data().regions.length;
  shapes = buildMapInto($("map"), projection,
    "Madagascar, " + count + " DHS survey regions, shaded by cost verdict");
  // Built once even though it is hidden outside compare mode: it is 23 paths,
  // and building it lazily would mean a first paint on a map already on screen.
  // display:none also keeps its paths out of the tab order while it is hidden.
  shapes2 = buildMapInto($("map2"), projection,
    "Madagascar, " + count + " DHS survey regions, shaded by targeting distortion");
}

/* ----------------------------------------------------------------- fill */

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hex2rgb(h: string): [number, number, number] {
  let s = h.replace("#", "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function lerpHex(a: string, b: string, t: number): string {
  const ra = hex2rgb(a);
  const rb = hex2rgb(b);
  return "rgb(" + ra.map((v, i) => Math.round(v + (rb[i] - v) * t)).join(",") + ")";
}

/* The palette lives in the stylesheet and is read back from it, so there is
   exactly one copy of every colour. Resolved once: these custom properties do
   not change after first paint, and calling getComputedStyle for every region on
   every keystroke is a layout read the render loop does not need. */
let palette: {
  remote: string; inperson: string; missing: string; seqLo: string; seqHi: string;
} | null = null;

function fills() {
  if (!palette) {
    palette = {
      remote: cssVar("--m-remote"),
      inperson: cssVar("--m-inperson"),
      missing: cssVar("--m-missing"),
      seqLo: cssVar("--seq-lo"),
      seqHi: cssVar("--seq-hi"),
    };
  }
  return palette;
}

/* Fill carries only which side of the line a region falls, in two colours far
   enough apart in luminance to survive greyscale. "Near the line" is marked with
   a dashed outline instead of a third fill: a third fill would have to sit
   between the two in luminance and stop being distinguishable in greyscale, and
   it would also hide which side the region is currently on. */
function verdictFill(kind: string, margin: number | null): string {
  const f = fills();
  if (kind === "missing") return f.missing;
  if (kind === "tipping") return (margin ?? 0) > 0 ? f.remote : f.inperson;
  return kind === "remote" ? f.remote : f.inperson;
}

/* The sequential layer. Targeting distortion is clamped to [0, 1]: 1.0 means the
   reachable pool mirrors the population, and a value above it -- a channel that
   over-represents the poorest fifth -- does not occur in this survey. Missing
   stays white rather than taking the pale end of the ramp, which would read as
   "nearly fine" for a region that has no answer at all. */
function distortionFill(region: Region): string {
  const g = basisGradient(region);
  const d = g ? g.targeting_distortion : null;
  const f = fills();
  return absent(d) ? f.missing : lerpHex(f.seqLo, f.seqHi, Math.max(0, Math.min(1, d)));
}

function distortionLabel(region: Region): string {
  const g = basisGradient(region);
  const d = g ? g.targeting_distortion : null;
  return region.name + ": " + (absent(d)
    ? "no targeting distortion value"
    : "targeting distortion " + d.toFixed(2));
}

/* ---------------------------------------------------------------- paint */

function setShape(shape: SVGPathElement | undefined, fill: string, tipping: boolean,
                  selected: boolean, label: string): void {
  if (!shape) return;
  shape.setAttribute("fill", fill);
  shape.setAttribute("data-tipping", String(tipping));
  shape.setAttribute("data-sel", String(selected));
  shape.setAttribute("aria-label", label);
  const title = shape.querySelector("title");
  if (title) title.textContent = label;
}

export function paintMaps(classified: Classified[]): void {
  const sequential = state.mode === "distortion";
  classified.forEach((row) => {
    const region = row.region;
    const verdict = row.verdict;
    const selected = region.region_id === state.sel;

    const costLabel = region.name + ": " + LABEL[verdict.kind] +
      (verdict.share === null ? "" : ", reachable share " + share(verdict.share));

    setShape(
      shapes[region.region_id],
      sequential ? distortionFill(region) : verdictFill(verdict.kind, verdict.margin),
      !sequential && verdict.kind === "tipping",
      selected,
      sequential ? distortionLabel(region) : costLabel,
    );

    // The second map is always the distortion layer, whatever the first shows.
    setShape(shapes2[region.region_id], distortionFill(region), false, selected,
      distortionLabel(region));
  });
}

/* ------------------------------------------------------------ hover line */

/* The hover line reports the verdict the map was last painted with, rather than
   recomputing one, so it can never disagree with what is on screen. */
let lastClassified: Classified[] = [];

export function rememberClassified(classified: Classified[]): void {
  lastClassified = classified;
}

function hover(id: string | null): void {
  const host = $("hoverinfo");
  // Nothing hovered, nothing to say. The line keeps its height in the layout so
  // the column does not shift as the pointer crosses the map.
  if (id === null) {
    host.textContent = "";
    return;
  }
  const row = lastClassified.find((r) => r.region.region_id === id);
  if (!row) return;
  const g = basisGradient(row.region);
  const d = g ? g.targeting_distortion : null;
  host.innerHTML = "<strong>" + row.region.name + "</strong> · " + LABEL[row.verdict.kind] +
    (row.verdict.share === null ? "" : " · " + share(row.verdict.share) + " reachable") +
    " · distortion " + (absent(d) ? MISSING : d.toFixed(2));
}

/* ---------------------------------------------------------- layer chips */

const MODES: [string, string][] = [
  ["verdict", "Cost verdict"],
  ["distortion", "Who it excludes"],
  ["compare", "Compare"],
];

export function renderMode(): void {
  const host = $("mode");
  host.innerHTML = "";
  MODES.forEach(([key, label]) => {
    const button = el("button", "modebtn" + (state.mode === key ? " on" : ""), label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.mode === key));
    button.addEventListener("click", () => {
      state.mode = key as typeof state.mode;
      // The column, not the button, carries the mode: the two-map grid, the
      // captions and the second legend are all CSS off this one attribute.
      $("mapcol").setAttribute("data-mode", state.mode);
      renderMode();
      actions.render();
    });
    host.appendChild(button);
  });
}

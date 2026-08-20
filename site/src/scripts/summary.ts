/* The line above the map, and the legends under it.
 *
 * Two legends exist in the markup: the first belongs to the main map and changes
 * with the layer, the second belongs to the compare view's right-hand map and is
 * always the sequential ramp. In compare mode the first is forced back to the
 * verdict swatches, because that is what its map is painting.
 */

import { $, el } from "./format";
import { constant, state } from "./state";
import type { Classified, VerdictKind } from "./classify";

export function renderSummary(classified: Classified[], r: number | null): void {
  const host = $("summary");
  if (r === null) {
    host.textContent = "Enter both costs for a recommendation.";
    return;
  }
  const counts: Record<VerdictKind, number> = { remote: 0, inperson: 0, tipping: 0, missing: 0 };
  classified.forEach((row) => { counts[row.verdict.kind] += 1; });

  host.innerHTML = "Line at <strong>" + (r * 100).toFixed(0) + "%</strong> · " +
    "<strong>" + counts.remote + "</strong> remote · " +
    "<strong>" + counts.inperson + "</strong> in person · " +
    "<strong>" + counts.tipping + "</strong> near the line" +
    (counts.missing ? " · <strong>" + counts.missing + "</strong> no value" : "");
}

function verdictSwatches(host: HTMLElement): void {
  host.appendChild(el("span", "lg", '<i class="sw sw-remote"></i>Remote-first cheaper'));
  host.appendChild(el("span", "lg", '<i class="sw sw-inperson"></i>In person cheaper'));
  host.appendChild(el("span", "lg", '<i class="sw sw-tipping"></i>Within ' +
    constant("tipping_band") * 100 + " pts of the line"));
  host.appendChild(el("span", "lg", '<i class="sw sw-missing"></i>No value'));
}

/* The ramp's two ends are named in one text run rather than as separate flex
   items either side of the swatch. Split across three items they each wrapped
   onto their own line inside the compare view's half-width column, which at
   375 px produced a stack of single words. */
function sequentialRamp(host: HTMLElement): void {
  host.appendChild(el("span", "lg",
    '<i class="sw sw-seq" aria-hidden="true"></i>' +
    "selects against the poor → mirrors the population"));
  host.appendChild(el("span", "lg",
    '<i class="sw sw-missing"></i>No value — suppressed, or no bottom-quintile households'));
}

export function renderLegends(): void {
  const first = $("legend");
  first.innerHTML = "";
  // In compare mode the left map is always the cost verdict, so its legend is
  // too; only the standalone "who it excludes" layer swaps the first legend.
  if (state.mode === "distortion") sequentialRamp(first);
  else verdictSwatches(first);

  const second = $("legend2");
  second.innerHTML = "";
  sequentialRamp(second);
}

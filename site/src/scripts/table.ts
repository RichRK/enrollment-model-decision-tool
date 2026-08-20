/* The all-regions table, now inside the notes accordion rather than a panel of
 * its own. Every column sorts; missing values sort last in either direction,
 * because "no value" is not a small value.
 */

import { absent, el, MISSING, num, pct, share, signedPts } from "./format";
import { $ } from "./format";
import { distortionClass, LABEL, type Classified, type Verdict } from "./classify";
import { actions, headlineGradient, stat, state, type Region } from "./state";

const COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Region" },
  { key: "distortion", label: "Targeting distortion" },
  { key: "exclusion_gap", label: "Exclusion gap" },
  { key: "verdict", label: "Recommendation" },
  { key: "share", label: "Reachable share" },
  { key: "margin", label: "Margin vs line" },
  { key: "pop_total", label: "Population" },
  { key: "hh_mobile_phone", label: "Household phone" },
  { key: "phone_own_f", label: "Women's phone" },
  { key: "literacy_f", label: "Women's literacy" },
  { key: "hh_electricity", label: "Electricity" },
];

function sortValue(region: Region, verdict: Verdict, key: string): string | number | null {
  const g = headlineGradient(region);
  switch (key) {
    case "name": return region.name;
    case "verdict": return ["missing", "inperson", "tipping", "remote"].indexOf(verdict.kind);
    case "share": return verdict.share;
    case "margin": return verdict.margin;
    case "distortion": return g ? g.targeting_distortion : null;
    case "exclusion_gap": return g ? g.exclusion_gap : null;
    default: return stat(region, key);
  }
}

// One table cell. Hoisted out of the per-row loop it was declared in, where it
// was rebuilt for every one of the 23 rows on every render.
function cell(tr: HTMLElement, html: string, missing?: boolean): void {
  tr.appendChild(el("td", missing ? "miss" : null, html));
}

export function renderTable(classified: Classified[]): void {
  const head = $("table-head");
  head.innerHTML = "";
  COLUMNS.forEach((col) => {
    const th = el("th", null, col.label +
      (state.sortKey === col.key ? '<span class="arrow">' + (state.sortDir < 0 ? " ↓" : " ↑") + "</span>" : ""));
    th.setAttribute("scope", "col");
    th.setAttribute("aria-sort", state.sortKey === col.key
      ? (state.sortDir < 0 ? "descending" : "ascending") : "none");
    th.addEventListener("click", () => {
      if (state.sortKey === col.key) state.sortDir = state.sortDir === 1 ? -1 : 1;
      else {
        state.sortKey = col.key;
        state.sortDir = col.key === "name" ? 1 : -1;
      }
      actions.render();
    });
    head.appendChild(th);
  });

  const rows = classified.slice();
  rows.sort((a, b) => {
    const va = sortValue(a.region, a.verdict, state.sortKey);
    const vb = sortValue(b.region, b.verdict, state.sortKey);
    // Missing values always sort last, whichever direction is active.
    if (absent(va)) return 1;
    if (absent(vb)) return -1;
    if (typeof va === "string") return va.localeCompare(String(vb)) * state.sortDir;
    return ((va as number) - (vb as number)) * state.sortDir;
  });

  const body = $("table-body");
  body.innerHTML = "";
  rows.forEach((row) => {
    const region = row.region;
    const verdict = row.verdict;
    const tr = el("tr");
    tr.setAttribute("data-sel", String(region.region_id === state.sel));
    // Marks the row as something that selects a region, so app.ts's click-away
    // dismissal can tell "clicked a row" from "clicked the page". An attribute on
    // the row itself rather than a selector rooted at the table, because these
    // rows are rebuilt on every render and are already detached by the time the
    // click reaches the document.
    tr.setAttribute("data-selects-region", "");
    tr.addEventListener("click", () => actions.select(region.region_id));

    const nameCell = el("td");
    nameCell.textContent = region.name;
    tr.appendChild(nameCell);

    const g = headlineGradient(region);
    const d = g ? g.targeting_distortion : null;
    cell(tr, absent(d) ? MISSING
      : '<span class="chip sev-' + distortionClass(d) + '">' + d.toFixed(2) + "</span>",
      absent(d));

    const gap = g ? g.exclusion_gap : null;
    cell(tr, absent(gap) ? MISSING : signedPts(gap), absent(gap));

    cell(tr, '<span class="pill pill-' + verdict.kind + '">' + LABEL[verdict.kind] + "</span>");
    cell(tr, share(verdict.share), absent(verdict.share));
    cell(tr, absent(verdict.margin) ? MISSING : signedPts(verdict.margin * 100),
      absent(verdict.margin));
    cell(tr, num(region.pop_total), absent(region.pop_total));
    ["hh_mobile_phone", "phone_own_f", "literacy_f", "hh_electricity"].forEach((key) => {
      const v = stat(region, key);
      cell(tr, pct(v), absent(v));
    });

    body.appendChild(tr);
  });
}

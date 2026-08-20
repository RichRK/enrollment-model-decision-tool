/* Quintile bar rows. Two variants of one row: the national gradient cards draw
 * a plain rate, the regional breakdown adds the unweighted case count and the
 * suppressed state. Those arrive as options rather than as a second copy of the
 * function.
 */

import { absent, el, MISSING, num, pct, share } from "./format";
import { constant, type NationalQuintileCell, type QuintileCell, type RegionGradient } from "./state";

export const QUINTILE_LABEL = ["Poorest", "Second", "Middle", "Fourth", "Richest"];

/* Bars are drawn against a fixed 0-100% domain, not against the largest value in
   their own card.
   Per-card normalisation made the top bar full width on every card, so 93.3%
   household phone ownership and 73.0% women's ownership drew as the same bar and
   the cards could not be compared with each other -- which is the whole reason
   they sit side by side. These are percentages of a stated base; the domain they
   belong on is the one they are already expressed in. */
const DOMAIN = 100;

interface BarOptions {
  cases?: number;
  flagged?: boolean;
  title?: string;
}

/* One quintile bar. The fill colour comes from a class, not an inline style, so
   the five-step ramp is declared once in the stylesheet next to the rest of the
   palette. */
function barRow(index: number, value: number | null, opts: BarOptions): HTMLElement {
  const row = el("div", "qrow");
  row.appendChild(el("span", "ql", QUINTILE_LABEL[index]));

  const track = el("div", "qtrack" + (absent(value) ? " sup" : ""));
  if (!absent(value)) {
    const fill = el("div", "qfill q" + index);
    // A floor, so a real but tiny rate still draws something rather than nothing
    // -- nothing would be indistinguishable from suppressed.
    fill.style.width = Math.max((value / DOMAIN) * 100, 0.8) + "%";
    track.appendChild(fill);
  }
  row.appendChild(track);

  row.appendChild(el("span", "qv" + (absent(value) ? " miss" : ""), pct(value)));

  if (opts.cases !== undefined) {
    // The unweighted case count travels with every cell, all the way to here.
    row.appendChild(el("span", "qn" + (opts.flagged ? " flag" : ""),
      "n=" + opts.cases + (opts.flagged ? " ⚠" : "")));
  }
  if (opts.title) row.title = opts.title;
  return row;
}

/** The national gradient cards: five rates, no case counts shown on the row. */
export function nationalBars(cells: NationalQuintileCell[]): HTMLElement {
  const wrap = el("div", "qbars");
  cells.forEach((c, i) => {
    wrap.appendChild(barRow(i, c.value, {
      title: QUINTILE_LABEL[i] + " quintile: " + pct(c.value) + " — " +
        num(c.cases_unweighted) + " unweighted cases; this quintile is " +
        share(c.population_share) + " of the population but " + share(c.pool_share) +
        " of everyone the channel reaches",
    }));
  });
  return wrap;
}

/** The regional breakdown: every cell carries its count, its flag and its
    suppressed state, and the footnote below says what those mean. */
export function regionBars(g: RegionGradient): HTMLElement {
  const cells: QuintileCell[] = g.ownership_by_quintile || [];
  const wrap = el("div", "qwrap");

  const bars = el("div", "qbars");
  cells.forEach((c, i) => {
    bars.appendChild(barRow(i, c.value, {
      cases: c.cases_unweighted,
      flagged: c.flagged,
      title: QUINTILE_LABEL[i] + ": " + (c.absent === true
        ? "the survey sampled no households in this region at this quintile — nothing " +
          "is suppressed here, there is nothing to suppress"
        : absent(c.value)
        ? "suppressed — only " + c.cases_unweighted + " unweighted cases, below the " +
          "floor of " + constant("min_cases_suppress")
        : pct(c.value) + " on " + c.cases_unweighted + " unweighted cases" +
          (c.flagged ? ", below the reliability threshold of " + constant("min_cases_flag") : "")),
    }));
  });
  wrap.appendChild(bars);

  const empty = (g.absent_quintiles || []).length;
  const suppressed = (g.suppressed_quintiles || []).length;
  const flagged = (g.flagged_quintiles || []).length;
  if (empty || suppressed || flagged) {
    wrap.appendChild(el("p", "sh-note",
      (empty
        ? "<strong>" + empty + " quintile(s) hold no households here at all</strong> — " +
          "the survey sampled none, so there is no rate to suppress and none to show. "
        : "") +
      (suppressed
        ? "<strong>" + suppressed + " cell(s) suppressed</strong> — under " +
          constant("min_cases_suppress") + " unweighted cases, so the rate reads " +
          MISSING + " rather than a number. "
        : "") +
      (flagged
        ? "<strong>" + flagged + " cell(s) flagged ⚠</strong> — under " +
          constant("min_cases_flag") + " cases, so the rate is shown but is unreliable. "
        : "") +
      "Wealth quintiles are national, so a poor region holds few rich households and " +
      "a rich one few poor households. Thin cells are expected here, not exceptional."));
  }
  return wrap;
}

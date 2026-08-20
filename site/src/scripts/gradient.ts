/* The national wealth gradient: one card per thing a remote enrollment depends
 * on, worst distortion first. Rendered once at start-up -- nothing on these
 * cards depends on what the user types.
 *
 * Not "per channel": two of the four cards are literacy, which is not a route to
 * anyone but a condition for using one. The pipeline draws the same distinction
 * (build.py groups these as access versus ability). */

import { $, el, MISSING, share, signedPts } from "./format";
import { distortionClass, groupWord } from "./classify";
import { data, type NationalGradient } from "./state";
import { nationalBars } from "./bars";
import { pct } from "./format";

/* Four cards, not all twelve. Showing every indicator turns an argument into a
   wall and buries the two that carry it. Ordered worst-distortion first, so the
   cards that most support the argument lead: the channel itself (household
   phone, then personal ownership among women), then the ability to use it
   (literacy, by sex).
   DHS publishes no combined literacy figure -- it reports women and men
   separately -- and a single "overall literacy" would have to be a weighted
   composite of the two, which is exactly the kind of invented number this
   project does not produce. Both are shown instead. */
const GRADIENT_ORDER = [
  "hh_mobile_phone", "phone_own_f", "literacy_f", "literacy_m",
];

function gradientCard(key: string, g: NationalGradient): HTMLElement {
  const meta = data().fields[key] || {};
  const card = el("figure", "gcard");
  const d = g.targeting_distortion;

  card.appendChild(el("figcaption", "glabel", meta.label || key));

  card.appendChild(el("div", "ghero",
    '<span class="gnum sev-' + distortionClass(d) + '">' +
    (d === null ? MISSING : d.toFixed(2)) + "</span>" +
    '<span class="gcap">targeting<br>distortion</span>'));

  // Horizontal bars, one per quintile. Five ordered marks; each is directly
  // labelled, so identity never rests on colour alone.
  card.appendChild(nationalBars(g.by_quintile));

  card.appendChild(el("div", "gfoot",
    // The separator is glued to the figure before it with a non-breaking space,
    // so a wrap never leaves a bare middot sitting at the start of a line.
    "Bottom " + groupWord("bottom_group") + " quintiles " + pct(g.bottom_group_rate) +
    " vs top " + groupWord("top_group") + " " + pct(g.top_group_rate) +
    "&nbsp;· gap <strong>" + signedPts(g.exclusion_gap) + "</strong>"));

  return card;
}

export function renderGradient(): void {
  const gradients = data().national.wealth_gradient;
  const grid = $("grad");
  grid.innerHTML = "";
  GRADIENT_ORDER.filter((k) => gradients[k])
    .forEach((key) => grid.appendChild(gradientCard(key, gradients[key])));

  const shown = GRADIENT_ORDER.filter((k) => gradients[k]);
  const phone = gradients.hh_mobile_phone;

  /* The lead paragraph: the worked example IS the definition, rather than an
     abstract statement of it followed by an instance. "Nothing here clears 1.0"
     is a claim about whichever cards were just rendered, so it is computed from
     that same list -- typed as prose it would quietly become false the first
     time a card with a healthier distortion was added. */
  const worst = Math.max(...shown.map((k) => gradients[k].targeting_distortion));
  $("grad-intro").innerHTML =
    "Nationally, the poorest fifth is <strong>" +
    share(phone.bottom_quintile_population_share) + "</strong> of the population but " +
    "only <strong>" + share(phone.bottom_quintile_pool_share) + "</strong> of everyone " +
    "a household phone can reach. That ratio — <strong>" +
    phone.targeting_distortion.toFixed(2) + "</strong> — is the card's " +
    "<strong>targeting distortion</strong>: the poorest fifth's share of everyone it " +
    "counts, divided by their share of the population. 1.0 would mirror the country; " +
    "below 1.0 the poorest are under-represented among the people remote enrollment " +
    "could actually reach." +
    (worst < 1 ? " <strong>Nothing here clears 1.0.</strong>" : "") +
    " Hovering any bar gives the unweighted case count behind it.";
}

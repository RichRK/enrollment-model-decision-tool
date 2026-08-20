/* The region drawer: a panel that slides in from the right on desktop and up
 * from the bottom on mobile. It replaces the old click-then-scroll detail
 * section, so selecting a region no longer moves the page under the reader.
 *
 * Content order is deliberate and is the v2 reframe: targeting distortion comes
 * first, above everything the cost model says, because it is the one figure that
 * answers the question the tool exists for -- not how many people a channel
 * misses, but which people.
 */

import { $, absent, el, MISSING, num, pct, share, signed } from "./format";
import { classify, costRatio, groupWord, LABEL, type Verdict } from "./classify";
import { constant, data, headlineGradient, stat, state, type Region, type RegionGradient } from "./state";
import { regionBars } from "./bars";
import { distortionClass } from "./classify";

function byId(id: string): Region | null {
  return data().regions.find((r) => r.region_id === id) || null;
}

/* Two figures of the same thing, side by side, with a line underneath saying why
   they differ. Household ownership against personal ownership among women. */
function comparison(head: string, leftNum: string, leftCap: string,
                    rightNum: string, rightCap: string, foot: string): HTMLElement {
  return el("div", "cmp",
    '<div class="cmp-head">' + head + "</div>" +
    '<div class="cmp-body">' +
    '<div class="cmp-cell"><span class="num">' + leftNum + "</span>" +
    '<span class="cap">' + leftCap + "</span></div>" +
    '<div class="cmp-cell"><span class="num">' + rightNum + "</span>" +
    '<span class="cap">' + rightCap + "</span></div>" +
    "</div>" +
    '<div class="cmp-foot">' + foot + "</div>");
}

/* The headline number for a region, given visual primacy over everything else. */
function distortionBlock(region: Region): HTMLElement {
  const g: RegionGradient | null = headlineGradient(region);
  const wrap = el("div", "sh-dist");

  if (!g || absent(g.targeting_distortion)) {
    wrap.appendChild(el("div", "sh-dist-none",
      "<strong>Targeting distortion unavailable</strong><br>" +
      ((g && g.pending_reason) || "the regional wealth breakdown has not been computed")));
    if (g && g.ownership_by_quintile && g.ownership_by_quintile.length) {
      wrap.appendChild(el("h4", "sh-sub", "Household phone ownership by wealth quintile"));
      wrap.appendChild(regionBars(g));
    }
    return wrap;
  }

  const d = g.targeting_distortion;
  wrap.appendChild(el("div", "sh-dist-head",
    '<span class="sh-dnum sev-' + distortionClass(d) + '">' + d.toFixed(2) + "</span>" +
    '<span class="sh-dcap">targeting distortion<em>' +
    (d < constant("distortion_alarm")
      ? "remote enrollment here <strong>selects against</strong> the poorest fifth"
      : "the reachable pool roughly mirrors the population") +
    "</em></span>"));

  const pool = g.reachable_pool_composition ? g.reachable_pool_composition[0] : null;
  if (pool) {
    wrap.appendChild(el("p", "sh-sentence",
      "The poorest fifth is <strong>" + share(pool.population_share) +
      "</strong> of this region's population but <strong>" + share(pool.pool_share) +
      "</strong> of everyone a household phone reaches. Ownership runs " +
      pct(g.bottom_group_rate) + " in the bottom " + groupWord("bottom_group") +
      " quintiles against " + pct(g.top_group_rate) + " in the top " +
      groupWord("top_group") + " — a gap of <strong>" +
      (absent(g.exclusion_gap) ? MISSING : signed(g.exclusion_gap) + " points") +
      "</strong>."));
  }

  wrap.appendChild(el("h4", "sh-sub", "Household phone ownership by wealth quintile"));
  wrap.appendChild(regionBars(g));

  if (!absent(g.targeting_distortion_bottom2)) {
    wrap.appendChild(el("p", "sh-note",
      "On the bottom <em>two</em> quintiles together — roughly twice the sample, and " +
      "the more robust reading where a single cell is thin — the distortion is " +
      "<strong>" + g.targeting_distortion_bottom2.toFixed(2) + "</strong>."));
  }
  return wrap;
}

/* The cost verdict, in a sentence, under the distortion block. */
function verdictSentence(verdict: Verdict, r: number | null): HTMLElement {
  const why = el("p", "sh-why");
  if (verdict.share === null) {
    why.textContent = "The basis you selected has no value for this region, so no " +
      "recommendation is made. It is not being treated as zero.";
  } else if (r === null) {
    why.textContent = "Enter both costs to get a recommendation.";
  } else {
    why.innerHTML = "Reachable share is <strong>" + share(verdict.share) +
      "</strong>. Your costs put the line at <strong>" + (r * 100).toFixed(1) + "%</strong>. " +
      (verdict.kind === "tipping"
        ? "That is inside the " + constant("tipping_band") * 100 + "-point band either " +
          "side of the line, so this region flips on small changes to your cost assumptions."
        : verdict.kind === "remote"
          ? "Remote-first is the cheaper route, by " +
            ((verdict.margin ?? 0) * 100).toFixed(1) + " points."
          : "In person is the cheaper route, by " +
            Math.abs((verdict.margin ?? 0) * 100).toFixed(1) + " points.");
  }
  return why;
}

const STATS: [string, string][] = [
  ["hh_mobile_phone", "Household phone"],
  ["phone_own_f", "Woman owns a phone"],
  ["literacy_f", "Women's literacy"],
  ["literacy_m", "Men's literacy"],
  ["mobile_money_f", "Mobile money (women)"],
  ["pop_total", "Population"],
];

function statGrid(region: Region): HTMLElement {
  const grid = el("div", "sh-stats");
  STATS.forEach(([key, label]) => {
    const value = stat(region, key);
    grid.appendChild(el("div", "sh-stat",
      '<span class="sh-sv' + (absent(value) ? " miss" : "") + '">' +
      (key === "pop_total" ? num(value) : pct(value)) + "</span>" +
      '<span class="sh-sl">' + label + "</span>"));
  });
  return grid;
}

/* Every indicator with its source and vintage, folded away. The stat grid
   above answers the question; this answers "where did that come from", which is
   worth keeping and is not worth 40 rows of the drawer's first screen. */
function fieldRow(region: Region, key: string): HTMLElement {
  const meta = data().fields[key] || {};
  const value = stat(region, key);
  const missing = absent(value);
  const display = missing ? MISSING : (key === "pop_total" ? num(value) : pct(value));

  return el("div", "field",
    '<div class="field-row">' +
    '<span class="field-label">' + (meta.label || key) + "</span>" +
    '<span class="field-value' + (missing ? " miss" : "") + '">' + display + "</span>" +
    "</div>" +
    '<div class="field-meta">' + (meta.source || "") +
    (meta.vintage ? ' <span class="vintage">· ' + meta.vintage + "</span>" : "") +
    (meta.note ? "<br>" + meta.note : "") + "</div>");
}

function fieldGroup(title: string, keys: string[], region: Region): HTMLElement {
  const wrap = el("div", "detail-group");
  wrap.appendChild(el("h5", null, title));
  keys.forEach((key) => wrap.appendChild(fieldRow(region, key)));
  return wrap;
}

function allIndicators(region: Region): HTMLElement {
  const details = el("details", "sh-fields");
  details.appendChild(el("summary", null, "All indicators, with sources"));
  details.appendChild(fieldGroup("Survey-reported access",
    ["hh_mobile_phone", "phone_own_f", "phone_own_m", "hh_electricity"], region));
  details.appendChild(fieldGroup("Ability and payout rails",
    ["literacy_f", "literacy_m",
     "mobile_money_f", "mobile_money_m", "bank_account_f", "bank_account_m"], region));
  details.appendChild(fieldGroup("Population", ["pop_total"], region));
  return details;
}

/* ---------------------------------------------------------------- render */

export function renderDrawer(): void {
  if (state.sel === null) return;
  const region = byId(state.sel);
  if (!region) return;

  const r = costRatio();
  const verdict = classify(region, r);
  const body = $("drawer-body");
  body.innerHTML = "";

  body.appendChild(el("div", "sh-head",
    "<h3>" + region.name + "</h3>" +
    '<span class="pill pill-' + verdict.kind + '">' + LABEL[verdict.kind] + "</span>"));

  // The headline metric goes first, above everything the cost model says.
  body.appendChild(distortionBlock(region));
  body.appendChild(verdictSentence(verdict, r));

  if (region.hh_mobile_phone !== null && region.phone_own_f !== null) {
    const gap = region.hh_mobile_phone - region.phone_own_f;
    body.appendChild(comparison(
      "Phone access: two measurements of the same thing",
      pct(region.hh_mobile_phone),
      "of households contain a mobile phone (DHS " + data().sources.dhs.survey_year + ")",
      pct(region.phone_own_f),
      "of women personally own one (DHS " + data().sources.dhs.survey_year + ")",
      "A gap of <strong>" + gap.toFixed(1) + " points</strong>. Both are correct; they " +
      "measure different things. If the people you enroll are women, the second number " +
      "is the one that constrains you.",
    ));
  }

  body.appendChild(statGrid(region));
  body.appendChild(allIndicators(region));
}

/* --------------------------------------------------------- open and close */

/* An open drawer stops the page behind it from scrolling. The drawer is a fixed,
   independently scrolling panel, so with the document still scrollable there are
   two scroll containers on screen at once and Windows draws a scrollbar for each
   -- the drawer's, and the page's immediately to its right.

   Locking the document removes its scrollbar, which would widen the layout by
   that scrollbar's width and shift the whole page. The width is therefore
   measured BEFORE the lock goes on and handed to CSS, which gives it straight
   back as padding on <body>. Centred content lands in exactly the same place; on
   platforms with overlay scrollbars the measurement is 0 and nothing moves.

   Separate from setDrawerOpen() because the two no longer always happen at the
   same moment: selecting a region on the map scrolls the column fully into view
   first, and a smooth scroll cannot run against `html { overflow: hidden }`. So
   for a map-origin selection the drawer opens now and the lock lands when the
   scroll has settled -- see select() in app.ts, which also owns the case where
   the reader closes the drawer while the page is still moving. */
export function setScrollLock(on: boolean): void {
  const root = document.documentElement;

  /* Measure only on the unlocked -> locked transition. Selecting a second region
     while the drawer is already open calls this again, and by then the document
     scrollbar is gone -- so the measurement reads 0, the padding compensating
     for it is dropped, and the centred layout jumps sideways by half the
     scrollbar's width on every region after the first. */
  const wasOpen = root.classList.contains("drawer-open");
  if (on && !wasOpen) {
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.setProperty("--scrollbar-width", scrollbar + "px");
  }
  root.classList.toggle("drawer-open", on);
}

/* `inert` rather than `hidden`: the drawer is moved off-screen by a transform,
   so without it a closed drawer stays in the tab order and Tab walks into a
   panel nobody can see. It is toggled together with the class so the two can
   never disagree. */
export function setDrawerOpen(open: boolean): void {
  const drawer = $("drawer");
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  if (open) drawer.removeAttribute("inert");
  else drawer.setAttribute("inert", "");
}

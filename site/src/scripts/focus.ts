/* Region focus: what selecting a region ON THE MAP does to the page.
 *
 * The page hands its width to the map. The prose fades out where it stands and
 * the map column travels left, landing centred in the width left over beside the
 * open drawer. Selection from the all-regions table does none of this -- that
 * table is far below the map, and moving the page under a reader who is looking
 * at it is the exact failure the drawer was introduced to avoid. app.ts decides
 * which of the two happened; this module only knows how to do the first.
 *
 * Both halves of the animation are declared in CSS, at rest, so the return
 * journey animates on the same curve. All this module toggles is the class, plus
 * the one distance CSS cannot compute for itself.
 */

import { $ } from "./format";

const GUTTER = 12;        // breathing room above and below the column, px
const DESKTOP = 941;      // matches the media query in styles.css
const SCROLL_CAP_MS = 800;

/* Where the map has to travel. Centre the column in the width that is left
   beside the drawer, and express it relative to where the column sits at rest.
   offsetLeft is a layout box, so it stays honest while the column is being
   translated -- getBoundingClientRect() would fold the current transform back
   into the next measurement and the column would walk further left on every
   recompute. */
function shiftPx(): number {
  if (window.innerWidth < DESKTOP) return 0;
  const col = $("mapcol");
  let restLeft = 0;
  for (let el: HTMLElement | null = col; el; el = el.offsetParent as HTMLElement | null) {
    restLeft += el.offsetLeft;
  }
  const free = window.innerWidth - $("drawer").offsetWidth;
  const target = Math.max(GUTTER * 2, (free - col.offsetWidth) / 2);
  return Math.round(target - restLeft);
}

/* The drawer's width is readable while it is still closed -- it is moved
   off-screen by a transform, not by layout -- so the shift can be computed
   before the drawer opens, and the two move together. */
export function setMapFocus(on: boolean): void {
  const article = $("app");
  const active = on && window.innerWidth >= DESKTOP;
  if (active) article.style.setProperty("--focus-shift", shiftPx() + "px");
  article.classList.toggle("map-focus", active);
  // A pane at opacity 0 that is still tabbable is a pane nobody can read and
  // everybody can Tab into. inert is what the closed drawer already uses.
  if (active) $("copy").setAttribute("inert", "");
  else $("copy").removeAttribute("inert");
}

/* Recompute on resize, which also re-evaluates the breakpoint -- dragging a
   window below 940px while focused has to give the copy back. Only while
   focused: at rest there is nothing to recompute and no class to write.
   renderMode() deliberately does not call this. The map column is the grid's
   `1fr` track, so its box is the same width in every layer and switching to
   Compare cannot change the distance. */
window.addEventListener("resize", () => {
  if ($("app").classList.contains("map-focus")) setMapFocus(true);
});

/* --------------------------------------------------------------- the scroll */

/* How far the page has to move for the whole column to be on screen. Zero if it
   already is, if it is off screen entirely, or if it simply does not fit.

   .mapcol is sticky and a viewport tall, so it does not move 1:1 with the page,
   and this naive delta looks like it should be wrong. There are only two ways
   the column is ever clipped, and it is right for both:
    - Near the top of the page, before it sticks. It moves 1:1 with the scroll
      until its top reaches .75rem, at which point it is stuck and -- being
      shorter than the viewport by 24px -- fully visible. `r.top - GUTTER` lands
      exactly there.
    - Near the notes, where the sticky context ends and the column releases
      upward. It moves 1:1 again, and scrolling back by `r.top - GUTTER`
      re-enters the sticky range, where it pins. */
function scrollDelta(): number {
  const r = $("mapcol").getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.bottom <= 0 || r.top >= vh) return 0;
  if (r.height > vh - GUTTER * 2) return 0;
  if (r.top < GUTTER) return r.top - GUTTER;
  if (r.bottom > vh - GUTTER) {
    // Never so far that the top goes off instead.
    return Math.min(r.bottom - (vh - GUTTER), r.top - GUTTER);
  }
  return 0;
}

export function scrollMapIntoView(): Promise<void> {
  const delta = scrollDelta();
  if (Math.abs(delta) < 1) return Promise.resolve();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
  return reduced ? Promise.resolve() : settled();
}

/* Resolves when scrolling has stopped. A frame-settle poll rather than the
   `scrollend` event, which is not on every engine this page has to run on; the
   cap is there so a resolved promise is guaranteed either way. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let last = window.scrollY;
    let still = 0;
    const tick = (): void => {
      if (window.scrollY === last) { if (++still >= 2) return resolve(); }
      else { still = 0; last = window.scrollY; }
      if (performance.now() - start > SCROLL_CAP_MS) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

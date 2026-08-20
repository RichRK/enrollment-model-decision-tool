/* Entry point. Parses the region data the Astro build inlined into the page,
 * wires the controls, and owns the render loop the leaf modules call back into.
 *
 * No dependencies and no network requests at all: src/pages/index.astro reads
 * pipeline/data/regions.json off disk at build time and inlines it as JSON, so
 * there is nothing left to fetch here.
 */

import { $, $opt, text } from "./format";
import { actions, setData, state, type Data, type Origin } from "./state";
import { classifyAll, costRatio } from "./classify";
import { buildMaps, paintMaps, rememberClassified, renderMode } from "./map";
import { renderGradient } from "./gradient";
import { renderBasis, renderLine } from "./scenario";
import { renderLegends, renderSummary } from "./summary";
import { renderTable } from "./table";
import { renderDrawer, setDrawerOpen, setScrollLock } from "./drawer";
import { scrollMapIntoView, setMapFocus } from "./focus";

function render(): void {
  const r = costRatio();
  // Classified once, then handed to all its consumers. Each of them used to
  // recompute the same verdict for the same 23 regions.
  const classified = classifyAll(r);
  rememberClassified(classified);

  renderLine(r);
  renderSummary(classified, r);
  renderLegends();
  paintMaps(classified);
  renderTable(classified);
  if (state.sel !== null) renderDrawer();
}

/* Bumped on every selection and every close. The scroll a map-origin selection
   starts is asynchronous, and whatever it was going to do when it finishes is
   only still wanted if nothing has happened in the meantime. */
let focusToken = 0;

/* Where keyboard focus was when the drawer opened, so Escape and the close
   button can put it back. Region shapes carry tabindex="0", so this is the shape
   that was clicked. */
let returnFocus: HTMLElement | null = null;

/* preventScroll because this page does its own scrolling, deliberately and on
   its own terms: the drawer is fixed, so focusing it has nothing to reveal, and
   an implicit scroll here would fight scrollMapIntoView() below. */
function focusDrawer(): void {
  $("drawer-close").focus({ preventScroll: true });
}

/* Only if it is still in the document and still focusable -- render() rebuilds
   the table's rows, so a row that raised a selection is detached by now. */
function restoreFocus(): void {
  const target = returnFocus;
  returnFocus = null;
  if (target && target.isConnected) target.focus({ preventScroll: true });
}

/* Selection, and everything it does to the page besides the drawer.
 *
 * From the map, the page hands its width to the map: the copy fades out, the map
 * column travels left, and the page scrolls first if the column is not already
 * whole on screen. From the table it opens the drawer and moves nothing -- the
 * table sits below the map, and shifting the page under a reader looking at it
 * is the failure the drawer exists to avoid. */
function select(regionId: string, origin: Origin): void {
  const opening = state.sel !== regionId;
  if (opening) {
    const from = document.activeElement as HTMLElement | null;
    /* Never the drawer's own controls. Selecting a second region while one is
       already open would otherwise record the close button -- which is about to
       be made inert -- and closing would drop focus to <body> instead of back to
       whatever opened the drawer in the first place. */
    if (!from || !from.closest('[data-bind="drawer"]')) returnFocus = from;
  }

  state.sel = state.sel === regionId ? null : regionId;
  render();
  setDrawerOpen(state.sel !== null);
  if (state.sel !== null) renderDrawer();

  focusToken++;                       // cancels any lock still pending

  if (state.sel === null) {
    setMapFocus(false);
    setScrollLock(false);
    restoreFocus();
    return;
  }

  // Before setMapFocus(), which makes .copy inert: the cost inputs live in there
  // and focus may be sitting on one of them, and a browser dropping focus to
  // <body> would lose the Tab position entirely.
  focusDrawer();

  if (origin !== "map") { setScrollLock(true); return; }   // table: drawer only

  setMapFocus(true);
  const token = focusToken;
  void scrollMapIntoView().then(() => {
    // The reader may have closed the drawer or picked another region while the
    // page was still moving. Locking then would lock a closed drawer.
    if (token === focusToken && state.sel !== null) setScrollLock(true);
  });
}

function close(): void {
  focusToken++;
  state.sel = null;
  setDrawerOpen(false);
  setScrollLock(false);
  setMapFocus(false);
  render();
  restoreFocus();
}

/* A click that must NOT dismiss the drawer.
   - the drawer itself;
   - anything that selects a region, which runs its own toggle: the shapes on
     either map, and the rows of the all-regions table;
   - the layer chips, which repaint the map the open drawer is describing --
     dismissing there would make it impossible to look at one region across the
     cost-verdict and who-it-excludes layers.
   EVERY selector here stands on its own; none is rooted at an ancestor. Both
   renderTable() and renderMode() rebuild their elements in the click handler, so
   the clicked row or chip is already detached from the document by the time this
   runs -- `[data-bind="table-body"] tr` and `.maplayers .modebtn` both stop
   matching at exactly the moment they are needed. `.modebtn` is on the button,
   `.rg` on the shape, `data-selects-region` on the row; a detached node still
   matches all three. (.maplayers is kept for clicks on the row's own padding,
   which is never rebuilt.) */
function keepsDrawerOpen(target: Element): boolean {
  return !!target.closest(
    '[data-bind="drawer"], .rg, [data-selects-region], .modebtn, .maplayers');
}

/* Click-away dismissal. A click anywhere else closes the drawer.
   Bubble phase, not capture: the map and table handlers have already run by the
   time this fires, so a click that just selected a region is a no-op here rather
   than a close-then-reopen. */
function dismissOnClickAway(e: MouseEvent): void {
  if (state.sel === null) return;
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== "function") return;
  if (keepsDrawerOpen(target)) return;
  close();
}

/* The Astro page embeds pipeline/data/regions.json verbatim in a
   <script type="application/json"> tag at build time. Reading it here is
   synchronous and cannot 404 the way a fetch could; the try/catch is for the
   case where the tag, or one of the [data-bind] hooks the components provide,
   is missing -- which means the build is stale or broken, not that the network
   failed, and the panel it reveals says so. */
try {
  const dataEl = document.getElementById("regions-data");
  if (!dataEl) throw new Error("no #regions-data element on the page");
  const parsed = JSON.parse(dataEl.textContent || "") as Data;

  setData(parsed);

  actions.select = select;
  actions.render = render;

  // Optional chrome: text() already tolerates a null node, and $opt() will not
  // take the article down if the masthead stops carrying these.
  text($opt("generated"), parsed.generated);
  text($opt("verified"), parsed.verified_on);

  $("app").hidden = false;

  buildMaps();
  renderMode();
  renderBasis();
  renderGradient();
  setDrawerOpen(false);
  setScrollLock(false);

  ["cost-remote", "cost-inperson"].forEach((name) => {
    $(name).addEventListener("input", render);
  });
  $("drawer-close").addEventListener("click", close);
  document.addEventListener("click", dismissOnClickAway);
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && state.sel !== null) close();
  });

  render();
} catch (err) {
  // Queried directly rather than through $(): $() throws on a missing hook, and
  // throwing out of the handler for a failure would leave the page with no
  // explanation at all.
  const panel = document.querySelector<HTMLElement>('[data-bind="load-error"]');
  if (panel) panel.hidden = false;
  if (window.console) window.console.error(err);
}

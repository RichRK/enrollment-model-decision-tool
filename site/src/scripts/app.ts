/* Entry point. Parses the region data the Astro build inlined into the page,
 * wires the controls, and owns the render loop the leaf modules call back into.
 *
 * No dependencies and no network requests at all: src/pages/index.astro reads
 * pipeline/data/regions.json off disk at build time and inlines it as JSON, so
 * there is nothing left to fetch here.
 */

import { $, $opt, text } from "./format";
import { actions, setData, state, type Data } from "./state";
import { classifyAll, costRatio } from "./classify";
import { buildMaps, paintMaps, rememberClassified, renderMode } from "./map";
import { renderGradient } from "./gradient";
import { renderBasis, renderLine } from "./scenario";
import { renderLegends, renderSummary } from "./summary";
import { renderTable } from "./table";
import { renderDrawer, setDrawerOpen } from "./drawer";

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

function select(regionId: string): void {
  state.sel = state.sel === regionId ? null : regionId;
  render();
  setDrawerOpen(state.sel !== null);
  if (state.sel !== null) renderDrawer();
}

function close(): void {
  state.sel = null;
  setDrawerOpen(false);
  render();
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

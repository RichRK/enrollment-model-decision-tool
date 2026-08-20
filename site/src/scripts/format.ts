/* Formatting primitives and DOM helpers, shared by every renderer.
 *
 * Ported from the pre-Astro app.js unchanged in behaviour. The comments that
 * survive here document traps that were paid for once already; they are not
 * restating what the code says.
 */

// A missing value is missing. It is never zero, and it never borrows a number
// from somewhere else.
export const MISSING = "—";

export type Maybe = number | null | undefined;

/* One predicate for "there is no value here". Both halves matter: a field absent
   from the JSON reads undefined, a field the pipeline nulled reads null, and they
   mean the same thing to a reader. Guarding only one of them is how a value ends
   up rendering "—" while still missing the is-missing class that greys it out. */
export function absent(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

export function pct(v: Maybe, digits = 1): string {
  if (absent(v)) return MISSING;
  return v.toFixed(digits) + "%";
}

export function share(v: Maybe, digits = 1): string {
  return absent(v) ? MISSING : pct(v * 100, digits);
}

export function num(v: Maybe): string {
  return absent(v) ? MISSING : v.toLocaleString("en");
}

// A signed difference, always carrying its sign.
export function signed(v: number, digits = 1): string {
  return (v > 0 ? "+" : "") + v.toFixed(digits);
}

// The unit is non-breaking so it never wraps onto its own line under the number.
export function signedPts(v: number): string {
  return signed(v) + "&nbsp;pts";
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function text(node: Element | null, value: string): void {
  if (node) node.textContent = value;
}

/* Throwing on a missing hook is deliberate, for STRUCTURAL hooks: the map, the
   drawer, the table, the basis list. Those are written by a component in
   src/components/, and a miss means the markup and the script have gone out of
   step -- a build problem, not a runtime condition to degrade around. app.ts
   wraps initialisation in a try/catch that surfaces exactly that as the "could
   not load" panel.

   Use $opt() instead for anything the page reads fine without. Deleting the
   masthead's provenance line once took the whole article down with it: $() threw
   on its [data-bind="generated"] span before app.ts reached the line that
   unhides the article, so removing one paragraph of chrome produced a page-level
   "could not load the region data". Nothing had failed to load. */
export function $(name: string): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-bind="' + name + '"]');
  if (!node) throw new Error('no [data-bind="' + name + '"] element on the page');
  return node;
}

/** A hook the page is allowed not to have. Returns null rather than throwing, so
    editing optional chrome out of a component cannot take the article with it. */
export function $opt(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-bind="' + name + '"]');
}

export function $all(name: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-bind="' + name + '"]'));
}

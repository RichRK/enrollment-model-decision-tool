/* The "i" tooltips and the two explanatory dialogs. */

/** Tooltips show on hover and toggle on click or tap. Each sits 8px under its
    button, flips above if there's no room below, and stays 8px inside the window.
    They are position: fixed, so they follow their button on scroll. */
export function initTips() {
  const all = () => document.querySelectorAll<HTMLElement>(".info");
  const setOpen = (w: HTMLElement, on: boolean) => {
    w.classList.toggle("open", on);
    w.querySelector("button")!.setAttribute("aria-expanded", String(on));
  };
  const closeAll = () => all().forEach((w) => setOpen(w, false));

  function place(w: HTMLElement) {
    const b = w.querySelector("button")!.getBoundingClientRect();
    const p = w.querySelector<HTMLElement>(".pop")!;
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let top = b.bottom + 8;
    if (top + ph > innerHeight - 8 && b.top - 8 - ph >= 8) top = b.top - 8 - ph;
    p.style.left = Math.max(8, Math.min(b.left + b.width / 2 - pw / 2, innerWidth - pw - 8)) + "px";
    p.style.top = top + "px";
  }
  const placeShown = () => all().forEach((w) => { if (w.matches(":hover") || w.classList.contains("open")) place(w); });

  document.addEventListener("click", (e) => {
    const b = (e.target as Element).closest(".info button");
    const w = b?.parentElement;
    const on = !!w && !w.classList.contains("open");
    closeAll();
    if (w && on) setOpen(w, true);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  // Placed a frame later, once :hover or .open has made the tooltip measurable.
  for (const ev of ["mouseover", "click"]) document.addEventListener(ev, (e) => {
    const w = (e.target as Element).closest?.<HTMLElement>(".info");
    if (w) requestAnimationFrame(() => place(w));
  }, true);
  addEventListener("scroll", placeShown, { passive: true, capture: true });
  addEventListener("resize", placeShown);
}

/** Each dialog opens from its data-dialog button, and closes on its close
    button, a click on the backdrop, or Escape (the browser's own). */
export function initDialogs() {
  for (const d of document.querySelectorAll("dialog")) {
    document.querySelector(`[data-dialog="${d.id}"]`)!.addEventListener("click", () => d.showModal());
    d.addEventListener("click", (e) => {
      const r = d.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside || (e.target as Element).closest(".close")) d.close();
    });
  }
}

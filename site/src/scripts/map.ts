/* The canvas map: one filled square per wealth square, region outlines on top,
   with wheel/pinch zoom, drag to pan, hover tooltip and click to select. */

import { DATA, at, n } from "./data";

export interface MapOptions {
  colourOf: (i: number) => string;
  /** Fill colours in paint order; squares of any other colour are not drawn. */
  palette: string[];
  selected: () => number;
  onSelect: (i: number) => void;
  tipHtml: (i: number) => string;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createMap(opts: MapOptions) {
  const { tx, ty } = DATA;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, tx[i]); x1 = Math.max(x1, tx[i] + 1);
    y0 = Math.min(y0, ty[i]); y1 = Math.max(y1, ty[i] + 1);
  }
  const box = document.getElementById("mapbox")!;
  const cv = document.getElementById("map") as HTMLCanvasElement;
  const ctx = cv.getContext("2d")!;
  const tip = document.getElementById("tip")!;
  const INK = css("--ink"), PANEL = css("--panel");
  const view = { k: 1, ox: 0, oy: 0 };
  let cw = 0, ch = 0, dpr = 1, hov = -1;

  function fit() {
    const pad = 20;
    view.k = Math.min((cw - 2 * pad) / (x1 - x0), (ch - 2 * pad) / (y1 - y0));
    view.ox = (cw - view.k * (x1 + x0)) / 2; view.oy = (ch - view.k * (y1 + y0)) / 2;
  }
  function resize() {
    const r = box.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
    const first = cw === 0; cw = r.width; ch = r.height;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    if (first) fit();
    draw();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
    const { k, ox, oy } = view, s = Math.max(k, 0.8) + 0.35;
    // Batch squares by colour: one path per colour is far faster than 43k fills.
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const px = ox + tx[i] * k, py = oy + ty[i] * k;
      if (px > cw || py > ch || px + s < 0 || py + s < 0) continue;
      const c = opts.colourOf(i); let g = groups.get(c); if (!g) groups.set(c, g = []); g.push(px, py);
    }
    for (const c of opts.palette) {
      const g = groups.get(c); if (!g) continue;
      ctx.fillStyle = c; ctx.beginPath();
      for (let j = 0; j < g.length; j += 2) ctx.rect(g[j], g[j + 1], s, s);
      ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.7; ctx.lineJoin = "round"; ctx.beginPath();
    for (const region of DATA.outlines) for (const poly of region) for (const ring of poly)
      ring.forEach((p, j) => { const X = ox + p[0] * k, Y = oy + p[1] * k; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke(); ctx.globalAlpha = 1;
    for (const i of [hov, opts.selected()]) {
      if (i < 0) continue;
      const cx = ox + (tx[i] + 0.5) * k, cy = oy + (ty[i] + 0.5) * k, h = Math.max(k / 2 + 3, 9);
      ctx.fillStyle = opts.colourOf(i); ctx.fillRect(cx - h, cy - h, 2 * h, 2 * h);
      ctx.lineWidth = 5; ctx.strokeStyle = PANEL; ctx.strokeRect(cx - h, cy - h, 2 * h, 2 * h);
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(cx - h, cy - h, 2 * h, 2 * h);
    }
  }

  const setHov = (i: number) => { if (i !== hov) { hov = i; draw(); } };
  const squareAt = (clientX: number, clientY: number) => {
    const r = cv.getBoundingClientRect();
    return at.get(Math.floor((clientX - r.left - view.ox) / view.k) * 20000 +
      Math.floor((clientY - r.top - view.oy) / view.k)) ?? -1;
  };
  function zoomAt(f: number, mx: number, my: number) {
    const k2 = Math.max(0.3, Math.min(view.k * f, 60));
    view.ox = mx - (mx - view.ox) * k2 / view.k; view.oy = my - (my - view.oy) * k2 / view.k; view.k = k2; draw();
  }

  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); const r = cv.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  const ptrs = new Map<number, [number, number]>();
  let pinch = 0, down: [number, number] | null = null;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    cv.classList.add("drag"); tip.hidden = true; setHov(-1);
    down = ptrs.size === 1 ? [e.clientX, e.clientY] : null;
  });
  cv.addEventListener("pointerup", (e) => {
    ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) cv.classList.remove("drag");
    // A press that barely moved is a click: select that square, or clear.
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
      const i = squareAt(e.clientX, e.clientY);
      opts.onSelect(i === opts.selected() ? -1 : i);
    }
    down = null;
  });
  cv.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); pinch = 0; });
  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect();
    const prev = ptrs.get(e.pointerId);
    if (prev) {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        pinch = d; return;
      }
      view.ox += e.clientX - prev[0]; view.oy += e.clientY - prev[1]; draw(); return;
    }
    const i = squareAt(e.clientX, e.clientY);
    if (i < 0) { tip.hidden = true; setHov(-1); return; }
    setHov(i);
    tip.innerHTML = opts.tipHtml(i);
    tip.hidden = false;
    // Beside the pointer, flipped to the other side near the map's edges.
    const t = tip.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + t.width > r.width) x = e.clientX - r.left - t.width - 10;
    if (y + t.height > r.height) y = e.clientY - r.top - t.height - 10;
    tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px";
  });
  cv.addEventListener("mouseleave", () => { tip.hidden = true; setHov(-1); });

  document.getElementById("zin")!.onclick = () => zoomAt(1.6, cw / 2, ch / 2);
  document.getElementById("zout")!.onclick = () => zoomAt(1 / 1.6, cw / 2, ch / 2);
  document.getElementById("zfit")!.onclick = () => { fit(); draw(); };
  new ResizeObserver(resize).observe(box);

  return { draw };
}

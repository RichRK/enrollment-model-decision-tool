/* Wires the controls, the answer panel and the map together. */

import { DATA, type Basis, covered, cum, fifths, fmt, n, pc, regionName, score } from "./data";
import { createMap } from "./map";
import { initDialogs, initTips } from "./tips";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const G = ["--g0", "--g1", "--g2", "--g3", "--g4"].map(css);
const IN = css("--inperson"), UNK = css("--unk"), OFF = css("--off"), LINE = css("--line");
const CUT = [15, 30, 50, 70];
const cls = (s: number) => { let c = 0; while (c < CUT.length && s >= CUT[c]) c++; return c; };
const $ = (id: string) => document.getElementById(id)!;

let basis: Basis = "phone_own", share = 0, unit = "pc", pct = 100, cutIdx = n, sel = -1;
const scoreOf = (i: number) => score(i, basis, share);

/** Squares [0, cutIdx) are included: the poorest squares covering pct% of people. */
function setCut() {
  const lim = covered * pct / 100; let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] - DATA.pop[m] / 2 < lim) lo = m + 1; else hi = m; }
  cutIdx = lo;
}

function colourOf(i: number) {
  if (i >= cutIdx) return OFF;
  const s = scoreOf(i); return s ? G[cls(s.v)] : UNK;
}

const map = createMap({
  colourOf,
  palette: [OFF, ...G, UNK],
  selected: () => sel,
  onSelect: (i) => { sel = i; map.draw(); answer(); },
  tipHtml: (i) => {
    const s = scoreOf(i);
    return (s ? '<div class="s">At most ' + Math.round(s.v) + "% by phone</div>" +
        (s.hi > s.v ? "possibly up to " + Math.round(s.hi) + "%<br>" : "") : '<div class="s">No survey figure</div>') +
      regionName(i) + " · " + fmt(DATA.pop[i]) + " people<br>" + fifths(DATA.fifth[i]) + (i < cutIdx ? "" : " · not included");
  },
});

const sw = (c: string, t: string, extra = "") => '<span><i style="background:' + c + extra + '"></i>' + t + "</span>";
$("legend").innerHTML = '<div class="t">Share of each square’s people who could enroll by phone, at most</div>' +
  ["Under 15%", "15–30%", "30–50%", "50–70%", "70% or more"].map((t, j) => sw(G[j], t)).join("") +
  sw(UNK, "No survey figure") + sw(OFF, "Not included", ";outline:1px solid " + LINE);

const chip = (cls: string, v: string, l: string, c: string, tip: string | null) =>
  '<span class="chip ' + cls + '"><span class="v">' + v + '</span><span class="l"><i style="background:' + c + '"></i>' + l + "</span>" +
  (tip ? '<span class="info"><button type="button" aria-label="More about this figure" aria-expanded="false">i</button><span class="pop" role="tooltip">' + tip + "</span></span>" : "") + "</span>";
/** The phone and in-person tiles, as shares of `all` or as head counts. */
const tiles = (ph: number | null, inp: number | null, all: number, phTip: string | null) => {
  const f = (v: number | null) => v === null ? "—" : unit === "pc" ? pc(v / all) : fmt(v);
  return chip("phone", f(ph), "by phone, at most", G[4], phTip) + chip("inp", f(inp), "in person on the visit", IN);
};
const bar = (parts: [number, string][], all: number) =>
  parts.map(([v, c]) => '<span style="width:' + (all > 0 ? v / all * 100 : 0).toFixed(2) + "%;background:" + c + '"></span>').join("");

function answer() {
  $("selbar").hidden = sel < 0;
  $("sliderBox").hidden = sel >= 0;
  if (sel >= 0) {
    const s = scoreOf(sel), p = DATA.pop[sel];
    $("selName").innerHTML = '<span class="rn">' + regionName(sel) + " <small>" + fmt(p) +
      ' people in this 2.4 km area</small></span><span>' + fifths(DATA.fifth[sel]) +
      (sel < cutIdx ? "" : " · not included at this wealth level") + "</span>";
    if (!s) {
      $("big").innerHTML = tiles(null, null, p, null);
      $("stack").innerHTML = bar([[p, UNK]], p);
      return;
    }
    const rem = p * s.v / 100, hi = p * s.hi / 100;
    $("big").innerHTML = tiles(rem, p - rem, p, s.hi > s.v
      ? "If the wealth index ranks this area one fifth too poor, up to " + Math.round(s.hi) + "% (" + fmt(hi) + ") could enroll by phone."
      : "This is the survey figure for its region and wealth fifth.");
    $("stack").innerHTML = bar([[rem, G[4]], [p - rem, IN]], p);
    return;
  }
  let tgt = 0, rem = 0, hi = 0, unk = 0;
  for (let i = 0; i < cutIdx; i++) {
    const p = DATA.pop[i], s = scoreOf(i); tgt += p;
    if (!s) { unk += p; continue; }
    rem += p * s.v / 100; hi += p * s.hi / 100;
  }
  const known = tgt - unk;
  $("cnt").textContent = fmt(tgt) + " people in " + cutIdx.toLocaleString("en") + " areas";
  $("big").innerHTML = tiles(rem, known - rem, tgt,
    "If the wealth index ranks some places one fifth too poor, up to " + pc(hi / tgt) + " (" + fmt(hi) + ") could enroll by phone.");
  $("stack").innerHTML = bar([[rem, G[4]], [known - rem, IN], [unk, UNK]], tgt);
}

/** A group of aria-pressed buttons: press one, run `on` with its data value. */
function segmented(id: string, key: string, on: (v: string) => void) {
  const buttons = document.querySelectorAll<HTMLButtonElement>("#" + id + " button");
  buttons.forEach((b) => b.addEventListener("click", () => {
    buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    on(b.dataset[key]!); map.draw(); answer();
  }));
}
segmented("hhSeg", "b", (v) => { basis = v as Basis; });
segmented("kSeg", "k", (v) => { share = +v; });
segmented("unitSeg", "u", (v) => { unit = v; });

const slider = $("pct") as HTMLInputElement;
slider.addEventListener("input", () => {
  pct = +slider.value;
  $("pctOut").textContent = pct === 100 ? "Everyone" : "Poorest " + pct + "%";
  setCut(); map.draw(); answer();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sel >= 0 && !document.querySelector("dialog[open]")) { sel = -1; map.draw(); answer(); }
});

initTips();
initDialogs();
setCut();
answer();

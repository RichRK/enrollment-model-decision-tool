/* The one part of the notes that answers to the basis selector.
 *
 * "N regions have no distortion answer" is a per-basis fact, not a fixed one:
 * 19 of the 23 regions have a usable targeting distortion on household phone
 * ownership, 18 on women's personal ownership -- Diana drops out, its women's
 * bottom-quintile cell being below the suppression floor. With the map, the
 * table and the drawer all following the selector, a count stuck on the
 * household reading would contradict the dashes the reader can see in the table.
 *
 * Notes.astro renders all of this at build time with the default basis, and
 * this module overwrites it. That order matters: the page promises in its
 * noscript panel that the notes are readable without JavaScript, so the script
 * may replace this content but must never be the only thing that supplies it.
 */

import { $opt, absent, el, text } from "./format";
import { basisGradient, data, type Region } from "./state";

const NUMBER_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten"];

// Counts read as words in prose up to ten, as digits beyond. Mirrors the same
// helper in Notes.astro, which renders the build-time version of this text.
function inWords(n: number): string {
  return NUMBER_WORD[n] ?? String(n);
}

interface NoAnswer {
  name: string;
  reason: string;
}

function withoutAnswer(): NoAnswer[] {
  const out: NoAnswer[] = [];
  data().regions.forEach((region: Region) => {
    const g = basisGradient(region);
    if (!g || absent(g.targeting_distortion)) {
      out.push({
        name: region.name,
        reason: (g && g.pending_reason) || "no regional breakdown",
      });
    }
  });
  return out;
}

export function renderNoAnswer(): void {
  const total = data().regions.length;
  const missing = withoutAnswer();

  text($opt("noanswer-count"),
    inWords(missing.length) + " region" + (missing.length === 1 ? "" : "s"));
  text($opt("noanswer-have"), (total - missing.length) + " of " + total);
  text($opt("noanswer-lack"), String(missing.length));

  const list = $opt("noanswer-list");
  if (!list) return;
  list.innerHTML = "";
  missing.forEach((row) => {
    // textContent for the name and reason: both come from the data file, and
    // neither is markup.
    const item = el("li");
    const name = el("strong");
    name.textContent = row.name;
    item.appendChild(name);
    item.appendChild(document.createTextNode(" — " + row.reason));
    list.appendChild(item);
  });
}

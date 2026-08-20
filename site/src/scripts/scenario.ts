/* The "Your scenario" card: the two cost inputs' derived line and the basis
 * selector. Each basis carries its own description, so there is no separate note
 * underneath restating it.
 *
 * The cost inputs themselves are plain markup in Scenario.astro -- deliberately
 * not wrapped in a <form>, which the data-agreement audit treats as data
 * capture. Nothing here submits anything anywhere.
 */

import { $, $all, el, MISSING } from "./format";
import { actions, state } from "./state";
import { BASES } from "./classify";

export function renderBasis(): void {
  const host = $("basis");
  host.innerHTML = "";
  BASES.forEach((basis) => {
    const label = el("label", "opt" + (basis.key === state.basis ? " on" : ""),
      '<input type="radio" name="basis" value="' + basis.key + '"' +
      (basis.key === state.basis ? " checked" : "") + ">" +
      '<span class="opt-name">' + basis.name + "</span>" +
      '<span class="opt-desc">' + basis.desc + "</span>");
    const input = label.querySelector("input");
    if (input) {
      input.addEventListener("change", () => {
        state.basis = basis.key;
        renderBasis();
        actions.render();
      });
    }
    host.appendChild(label);
  });
}

export function renderLine(r: number | null): void {
  $all("line").forEach((node) => {
    node.textContent = r === null ? MISSING : (r * 100).toFixed(1) + "%";
  });
}

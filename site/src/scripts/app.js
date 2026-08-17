/* Viewer for pipeline/data/regions.json.
 *
 * Everything measured is precomputed by the build step. The only arithmetic here
 * is the cost comparison, because that has to respond to what the user types.
 *
 * No dependencies, no network requests at all: the Astro build
 * (site/src/pages/index.astro) reads pipeline/data/regions.json off disk and
 * inlines it into the page as JSON, so there is nothing left to fetch here.
 */

(function () {
  "use strict";

  var state = {
    data: null,
    basis: "hh_mobile_phone",
    selected: null,
    sortKey: "share",
    sortDir: -1
  };

  var $ = function (name) { return document.querySelector('[data-bind="' + name + '"]'); };

  /* Every model threshold travels with the data, in regions.json's `constants`
     block, rather than being mirrored here by hand. They are judgement calls, they
     live in pipeline/config.py with their reasoning next to them, and a copy on this
     side could only ever drift out of date -- which is what the comment on the
     previous copy of DISTORTION_ALARM was quietly admitting. */
  function constant(name) { return state.data.constants[name]; }

  /* ------------------------------------------------------------ formatting */

  // A missing value is missing. It is never zero, and it never borrows a number
  // from somewhere else.
  var MISSING = "—";

  // One predicate for "there is no value here". Both halves matter: a field absent
  // from the JSON reads undefined, a field the pipeline nulled reads null, and they
  // mean the same thing to a reader. Guarding only one of them is how a value ends
  // up rendering "—" while still missing the is-missing class that greys it out.
  function absent(v) { return v === null || v === undefined; }

  function pct(v, digits) {
    if (absent(v)) return MISSING;
    return v.toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function share(v, digits) {
    return absent(v) ? MISSING : pct(v * 100, digits);
  }

  function num(v) {
    return absent(v) ? MISSING : v.toLocaleString("en");
  }

  // A signed difference, always carrying its sign. The unit is non-breaking so it
  // never wraps onto its own line under the number.
  function signed(v, digits) {
    return (v > 0 ? "+" : "") + v.toFixed(digits === undefined ? 1 : digits);
  }

  function signedPts(v) { return signed(v) + "&nbsp;pts"; }

  function text(node, value) { if (node) node.textContent = value; }

  // One table cell. Hoisted out of the per-row loop it was declared in, where it
  // was rebuilt for every one of the 23 rows on every render.
  function cell(tr, html, missing) {
    tr.appendChild(el("td", missing ? "is-missing" : null, html));
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /* ---------------------------------------------------- the decision itself */

  var BASES = [
    {
      key: "hh_mobile_phone",
      name: "Household owns a mobile phone",
      desc: "The most generous reading, and an upper bound. It counts households " +
            "containing a phone, not people who can use one."
    },
    {
      key: "phone_own_f",
      name: "Woman personally owns a mobile phone",
      desc: "The binding constraint if the people being enrolled are women. " +
            "Substantially lower than the household figure in every region."
    },
    {
      key: "phone_and_literacy_f",
      name: "Woman owns a phone and is literate",
      desc: "For a process involving written instructions or forms. This is a range, " +
            "not a number, and the range is wide — see the note below."
    }
  ];

  function costRatio() {
    var remote = parseFloat($("cost-remote").value);
    var inperson = parseFloat($("cost-inperson").value);
    if (!isFinite(remote) || !isFinite(inperson) || inperson <= 0) return null;
    return remote / inperson;
  }

  /* Remote-first costs cost_remote for everyone plus cost_inperson for the share
     who cannot complete it. That beats all-in-person exactly when
        cost_remote + (1 - s) * cost_inperson  <  cost_inperson
     which reduces to  s > cost_remote / cost_inperson. */
  function classify(region, r) {
    var value = region.feasibility_bases[state.basis];
    if (absent(value)) {
      return { kind: "missing", share: null, margin: null };
    }
    var s = value / 100;
    if (r === null) return { kind: "missing", share: s, margin: null };
    var margin = s - r;
    if (Math.abs(margin) <= constant("tipping_band")) {
      return { kind: "tipping", share: s, margin: margin };
    }
    return { kind: margin > 0 ? "remote" : "inperson", share: s, margin: margin };
  }

  // One verdict per region, computed once per render and handed to every consumer.
  // The summary, the map, the table and the detail panel all need the same answer;
  // they used to each recompute it, so classify() ran four times per region.
  function classifyAll(r) {
    return state.data.regions.map(function (region) {
      return { region: region, verdict: classify(region, r) };
    });
  }

  var LABEL = {
    remote: "Remote",
    inperson: "In person",
    tipping: "Near the line",
    missing: "No value"
  };

  /* ------------------------------------------ the wealth gradient (national) */

  // Ordinal ramp: one hue, light to dark, poorest to richest. Ordered magnitude,
  // so a sequential ramp rather than categorical hues. The light end clears 2:1
  // against the white surface, so the poorest bar never dissolves into the page.
  var QUINTILE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
  var QUINTILE_LABEL = ["Poorest", "Second", "Middle", "Fourth", "Richest"];

  // Ordered worst-distortion first: the cards that most support the argument lead.
  var GRADIENT_ORDER = [
    "hh_mobile_phone", "phone_own_f", "mobile_money_f", "internet_f",
    "literacy_f", "hh_electricity"
  ];

  function distortionClass(d) {
    if (absent(d)) return "neutral";
    if (d >= constant("distortion_alarm")) return "ok";
    if (d >= constant("distortion_warn")) return "warn";
    return "bad";
  }

  /* The scale a set of quintile bars is drawn against: the largest value present,
     never zero. Both guards are load-bearing and neither copy of this used to have
     both -- one ignored nulls but could return 0 when every surviving cell was 0.0,
     which makes every bar width NaN%. */
  function barScale(values) {
    var present = values.filter(function (v) { return !absent(v); });
    var max = present.length ? Math.max.apply(null, present) : 0;
    return max > 0 ? max : 1;
  }

  /* One quintile bar. The national gradient cards and the per-region breakdown draw
     the same row; only the trailing case count and the suppressed state are specific
     to the regional one, so those arrive as options rather than as a second copy of
     the function. */
  function barRow(label, value, colour, scale, opts) {
    opts = opts || {};
    var row = el("div", "bar-row");
    row.appendChild(el("span", "bar-label", label));

    var track = el("div", "bar-track");
    if (absent(value)) {
      track.classList.add("bar-track--suppressed");
    } else {
      var fill = el("div", "bar-fill");
      fill.style.width = Math.max(value / scale * 100, 0.8) + "%";
      fill.style.background = colour;
      track.appendChild(fill);
    }
    row.appendChild(track);

    row.appendChild(el("span", "bar-value" + (absent(value) ? " is-missing" : ""),
      pct(value)));
    if (opts.cases !== undefined) {
      // The unweighted case count travels with every cell, all the way to here.
      row.appendChild(el("span", "bar-cases" + (opts.flagged ? " bar-cases--flagged" : ""),
        "n=" + opts.cases + (opts.flagged ? " ⚠" : "")));
    }
    if (opts.title) row.title = opts.title;
    return row;
  }

  function gradientCard(key, gradient) {
    var meta = state.data.fields[key] || {};
    var card = el("figure", "gradient-card");
    var d = gradient.targeting_distortion;

    card.appendChild(el("figcaption", "gradient-title", meta.label || key));

    var hero = el("div", "gradient-hero");
    hero.appendChild(el("span", "hero-num hero-num--" + distortionClass(d),
      d === null ? MISSING : d.toFixed(2)));
    hero.appendChild(el("span", "hero-cap", "targeting<br>distortion"));
    card.appendChild(hero);

    // Horizontal bars, one per quintile. Five ordered marks; each is directly
    // labelled, so identity never rests on colour alone.
    var scale = barScale(gradient.by_quintile.map(function (q) { return q.value; }));
    var bars = el("div", "bars");
    gradient.by_quintile.forEach(function (q, i) {
      bars.appendChild(barRow(QUINTILE_LABEL[i], q.value, QUINTILE_RAMP[i], scale, {
        title: QUINTILE_LABEL[i] + " quintile: " + pct(q.value) + " — " +
          num(q.cases_unweighted) + " unweighted cases; this quintile is " +
          share(q.population_share) + " of the population but " + share(q.pool_share) +
          " of everyone the channel reaches"
      }));
    });
    card.appendChild(bars);

    card.appendChild(el("div", "gradient-foot",
      "Bottom " + groupWord("bottom_group") + " quintiles " +
      pct(gradient.bottom_group_rate) +
      " vs top " + groupWord("top_group") + " " + pct(gradient.top_group_rate) +
      " &middot; gap <strong>" + signedPts(gradient.exclusion_gap) + "</strong>"));

    return card;
  }

  /* The quintile split is a judgement call recorded in pipeline/config.py and
     shipped in `constants`; the page used to restate its size as the English words
     "two" and "three" in four places, which would quietly become wrong if the split
     ever moved. */
  var COUNT_WORD = ["zero", "one", "two", "three", "four", "five"];

  function groupWord(which) {
    var n = constant(which).length;
    return COUNT_WORD[n] || String(n);
  }

  function renderGradient() {
    var gradients = state.data.national.wealth_gradient;
    var grid = $("gradient-grid");
    grid.innerHTML = "";

    // Deliberately the curated six, not all twelve. The male equivalents are real
    // and are in each region's detail; showing all of them here turns an argument
    // into a wall and buries the two cards that carry it.
    GRADIENT_ORDER.filter(function (k) { return gradients[k]; })
      .forEach(function (key) { grid.appendChild(gradientCard(key, gradients[key])); });

    var phone = gradients.hh_mobile_phone;
    var womanPhone = gradients.phone_own_f;
    var manPhone = gradients.phone_own_m;

    var note =
      "Read the first card as the worked example. Nationally the poorest fifth is " +
      "<strong>" + share(phone.bottom_quintile_population_share) + "</strong> of the " +
      "population but only <strong>" + share(phone.bottom_quintile_pool_share) +
      "</strong> of everyone a household phone can reach — a distortion of <strong>" +
      phone.targeting_distortion.toFixed(2) + "</strong>. Hovering any bar gives the " +
      "unweighted case count behind it.";

    if (womanPhone && manPhone && womanPhone.targeting_distortion > 0) {
      note += " <strong>The distortion is also sexed.</strong> Personal phone ownership " +
        "distorts at " + womanPhone.targeting_distortion.toFixed(2) + " for women against " +
        manPhone.targeting_distortion.toFixed(2) + " for men, so a phone-based channel " +
        "excludes poor women roughly " +
        (manPhone.targeting_distortion / womanPhone.targeting_distortion).toFixed(1) +
        " times as hard as it excludes poor men. Both figures are on every region's detail.";
    }

    note += " These are national figures from the DHS " +
      state.data.sources.dhs.survey_year + " wealth-quintile breakdown. The regional " +
      "equivalents — the ones a regional decision actually needs — are what section 2 is about.";

    var withheld = state.data.national.wealth_gradient_withheld || {};
    var withheldKeys = Object.keys(withheld);
    if (withheldKeys.length) {
      note += "<br><br><strong>Withheld: " +
        withheldKeys.map(function (k) {
          return (state.data.fields[k] || {}).label || k;
        }).join(", ") + ".</strong> " +
        "The DHS API returns these quintile rates without an unweighted case count — an " +
        "empty string rather than a number. Under the data agreement a published cell has " +
        "to carry the count that shows it is large enough to be non-disclosive, and a " +
        "count that cannot be produced cannot be assumed. The counts could have been " +
        "borrowed from another indicator drawn on the same base, whose weighted " +
        "denominators match exactly; that would have been reasoning, not evidence, so " +
        "the rates are not shown. " +
        "<span class=\"withheld-detail\">" +
        withheldKeys.map(function (k) { return withheld[k]; }).join("; ") + "</span>";
    }

    $("gradient-note").innerHTML = note;
  }

  /* ------------------------------------------------------------- pending */

  function renderPending() {
    var host = $("pending");
    host.innerHTML = "";
    var p = (state.data.pending || {}).regional_wealth_gradient;

    if (p) {
      host.appendChild(el("p", "lede",
        "The metric this tool is built around is <strong>targeting distortion per " +
        "region</strong>. That number is not on this page, because it cannot currently be " +
        "computed. Saying so plainly is better than filling the gap with the national " +
        "figure, which would reproduce exactly the error the tool exists to expose."));

      var box = el("div", "pending-box");
      box.appendChild(el("h3", null, "Blocked on: " + p.blocked_on));
      box.appendChild(el("p", null, p.why));
      var list = el("ul", "pending-list");
      p.unblocks.forEach(function (item) {
        list.appendChild(el("li", null, "<code>" + item + "</code>"));
      });
      box.appendChild(el("p", "pending-sub", "What lands when it is unblocked:"));
      box.appendChild(list);
      host.appendChild(box);
      return;
    }

    // The recodes are present. Report what survived suppression rather than
    // implying every region has an answer.
    var regions = state.data.regions;
    var usable = regions.filter(function (rg) {
      var g = regionGradient(rg, constant("headline_indicator"));
      return g && !absent(g.targeting_distortion);
    });
    var unanswered = regions.filter(function (rg) { return usable.indexOf(rg) === -1; });

    host.appendChild(el("p", "lede",
      "The regional breakdown is computed, from the DHS " +
      state.data.sources.dhs.survey_year + " household and individual recodes. " +
      "<strong>" + usable.length + " of " + regions.length + "</strong> regions have a " +
      "usable targeting distortion. The other <strong>" + unanswered.length + "</strong> do " +
      "not, and are shown as unavailable rather than estimated."));

    var box2 = el("div", "pending-box");
    box2.appendChild(el("h3", null, "Why " + unanswered.length + " regions have no distortion"));
    var ul = el("ul", "pending-list");
    unanswered.forEach(function (rg) {
      var g = regionGradient(rg, constant("headline_indicator")) || {};
      ul.appendChild(el("li", null, "<strong>" + rg.name + "</strong> — " +
        (g.pending_reason || "no regional breakdown")));
    });
    box2.appendChild(ul);
    box2.appendChild(el("p", null,
      "Wealth quintiles are defined <em>nationally</em>, so a wealthy region holds " +
      "almost no bottom-quintile households and a poor one almost no top-quintile " +
      "households. Every case above is that effect, and it lands hardest at both ends " +
      "of the distribution — which is where a targeted programme most wants an answer."));
    host.appendChild(box2);

    host.appendChild(el("p", "footnote",
      "Suppression follows DHS's own conventions, not this project's, and is not " +
      "configurable: every region &times; quintile cell carries its unweighted case " +
      "count, cells below <strong>" + constant("min_cases_flag") +
      "</strong> cases are flagged ⚠ and shown, cells below <strong>" +
      constant("min_cases_suppress") + "</strong> are suppressed and show " +
      "&ldquo;—&rdquo;. Where any cell in a region is suppressed, the distortion for that " +
      "region is withheld too: it is a share of a total, and a total missing one of its " +
      "five parts would understate the denominator and flatter the result."));
  }

  /* ------------------------------------------------------------------- map */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function eachRing(geometry, fn) {
    var polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach(function (polygon) { polygon.forEach(fn); });
  }

  function bbox(regions) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    regions.forEach(function (region) {
      eachRing(region.geometry, function (ring) {
        ring.forEach(function (pt) {
          if (pt[0] < b.x0) b.x0 = pt[0];
          if (pt[0] > b.x1) b.x1 = pt[0];
          if (pt[1] < b.y0) b.y0 = pt[1];
          if (pt[1] > b.y1) b.y1 = pt[1];
        });
      });
    });
    return b;
  }

  function buildMap(regions) {
    var b = bbox(regions);
    // Equirectangular, longitudes compressed by cos(mean latitude) so the country
    // is not stretched east-west. Adequate for one country at this size; nothing
    // here is measured off the map.
    var midLat = (b.y0 + b.y1) / 2;
    var kx = Math.cos(midLat * Math.PI / 180);
    var width = (b.x1 - b.x0) * kx;
    var height = b.y1 - b.y0;
    var pad = height * 0.02;

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", [-pad, -pad, width + pad * 2, height + pad * 2].join(" "));
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Map of Madagascar by DHS region");

    function project(pt) { return [(pt[0] - b.x0) * kx, b.y1 - pt[1]]; }

    function pathFor(geometry) {
      var d = [];
      eachRing(geometry, function (ring) {
        ring.forEach(function (pt, i) {
          var p = project(pt);
          d.push((i === 0 ? "M" : "L") + p[0].toFixed(4) + " " + p[1].toFixed(4));
        });
        d.push("Z");
      });
      return d.join("");
    }

    var shapes = {};
    regions.forEach(function (region) {
      var fill = document.createElementNS(SVG_NS, "path");
      fill.setAttribute("d", pathFor(region.geometry));
      fill.setAttribute("class", "region-shape");
      fill.setAttribute("tabindex", "0");
      fill.setAttribute("role", "button");
      // Capture the id, not the region: these listeners outlive this loop for the
      // life of the page, and closing over the whole record would pin every
      // region's geometry -- the bulk of the payload -- in memory for no reason.
      var id = region.region_id;
      fill.addEventListener("click", function () { select(id); });
      fill.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); }
      });
      svg.appendChild(fill);
      shapes[region.region_id] = fill;
    });

    /* Keyboard focus ring, drawn rather than outlined.
     *
     * CSS `outline` cannot be used here at all: Chromium resolves it in SVG user
     * units, so both `auto` and an explicit `2px` render as a ~100-240 px halo
     * against this viewBox. These two paths are appended last so they paint above
     * every region, and their stroke widths use vector-effect, so they really are
     * in screen pixels. White halo under a dark edge reads against both fills. */
    var halo = document.createElementNS(SVG_NS, "path");
    halo.setAttribute("class", "focus-ring focus-ring--halo");
    var edge = document.createElementNS(SVG_NS, "path");
    edge.setAttribute("class", "focus-ring focus-ring--edge");
    svg.appendChild(halo);
    svg.appendChild(edge);

    function showFocusRing(path) {
      [halo, edge].forEach(function (ring) {
        ring.setAttribute("d", path.getAttribute("d"));
        ring.setAttribute("data-shown", "true");
      });
    }
    function hideFocusRing() {
      [halo, edge].forEach(function (ring) { ring.setAttribute("data-shown", "false"); });
    }

    svg.addEventListener("focusin", function (e) {
      // Only for keyboard focus. A mouse click focuses the path too, and a ring
      // there would fight with the selection stroke it already gets.
      if (e.target.matches && e.target.matches(".region-shape:focus-visible")) {
        showFocusRing(e.target);
      }
    });
    svg.addEventListener("focusout", hideFocusRing);

    $("map").innerHTML = "";
    $("map").appendChild(svg);
    return shapes;
  }

  var shapes = {};

  var FILL = { remote: "#1f4e79", inperson: "#edc373", missing: "#ffffff" };

  /* Fill carries only which side of the line a region falls, in two colours far
     enough apart in luminance to survive greyscale. "Near the line" is marked with
     a dashed outline instead of a third fill: a third fill would have to sit
     between the two in luminance and stop being distinguishable in greyscale, and
     it would also hide which side the region is currently on. */
  function fillFor(verdict) {
    if (verdict.kind === "missing") return FILL.missing;
    if (verdict.kind === "tipping") return verdict.margin > 0 ? FILL.remote : FILL.inperson;
    return FILL[verdict.kind];
  }

  function paintMap(classified) {
    classified.forEach(function (row) {
      var region = row.region, verdict = row.verdict;
      var shape = shapes[region.region_id];
      if (!shape) return;
      shape.setAttribute("fill", fillFor(verdict));
      shape.setAttribute("data-tipping", verdict.kind === "tipping");
      shape.setAttribute("data-selected", region.region_id === state.selected);
      var label = region.name + ": " + LABEL[verdict.kind] +
        (verdict.share === null ? "" : ", reachable share " + share(verdict.share));
      shape.setAttribute("aria-label", label);
      var title = shape.querySelector("title") ||
        shape.appendChild(document.createElementNS(SVG_NS, "title"));
      title.textContent = label;
    });
  }

  /* ----------------------------------------------------------------- table */

  var COLUMNS = [
    { key: "name", label: "Region" },
    { key: "distortion", label: "Targeting distortion" },
    { key: "exclusion_gap", label: "Exclusion gap" },
    { key: "verdict", label: "Recommendation" },
    { key: "share", label: "Reachable share" },
    { key: "margin", label: "Margin vs line" },
    { key: "pop_total", label: "Population" },
    { key: "hh_mobile_phone", label: "Household phone" },
    { key: "phone_own_f", label: "Women's phone" },
    { key: "literacy_f", label: "Women's literacy" },
    { key: "hh_electricity", label: "Electricity" }
  ];

  function sortValue(region, verdict, key) {
    var g;
    switch (key) {
      case "name": return region.name;
      case "verdict": return ["missing", "inperson", "tipping", "remote"].indexOf(verdict.kind);
      case "share": return verdict.share;
      case "margin": return verdict.margin;
      case "distortion":
        g = regionGradient(region, constant("headline_indicator"));
        return g ? g.targeting_distortion : null;
      case "exclusion_gap":
        g = regionGradient(region, constant("headline_indicator"));
        return g ? g.exclusion_gap : null;
      default: return region[key];
    }
  }

  function renderTable(classified) {
    var head = $("table-head");
    head.innerHTML = "";
    COLUMNS.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col.label;
      if (state.sortKey === col.key) {
        var arrow = el("span", "arrow", state.sortDir < 0 ? " ↓" : " ↑");
        th.appendChild(arrow);
      }
      th.setAttribute("scope", "col");
      th.addEventListener("click", function () {
        if (state.sortKey === col.key) state.sortDir *= -1;
        else { state.sortKey = col.key; state.sortDir = col.key === "name" ? 1 : -1; }
        render();
      });
      head.appendChild(th);
    });

    var rows = classified.slice();

    rows.sort(function (a, b) {
      var va = sortValue(a.region, a.verdict, state.sortKey);
      var vb = sortValue(b.region, b.verdict, state.sortKey);
      // Missing values always sort last, whichever direction is active.
      if (absent(va)) return 1;
      if (absent(vb)) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * state.sortDir;
      return (va - vb) * state.sortDir;
    });

    var body = $("table-body");
    body.innerHTML = "";
    rows.forEach(function (row) {
      var region = row.region, verdict = row.verdict;
      var tr = document.createElement("tr");
      tr.setAttribute("data-selected", region.region_id === state.selected);
      tr.addEventListener("click", function () { select(region.region_id); });

      var nameCell = document.createElement("td");
      nameCell.textContent = region.name;
      tr.appendChild(nameCell);

      var g = regionGradient(region, constant("headline_indicator"));
      var d = g ? g.targeting_distortion : null;
      cell(tr, absent(d) ? MISSING
        : '<span class="dist-chip dist-chip--' + distortionClass(d) + '">' +
          d.toFixed(2) + "</span>",
        absent(d));
      var gap = g ? g.exclusion_gap : null;
      cell(tr, absent(gap) ? MISSING : signedPts(gap), absent(gap));

      cell(tr, '<span class="pill pill--' + verdict.kind + '">' +
        LABEL[verdict.kind] + "</span>");
      cell(tr, share(verdict.share), absent(verdict.share));
      cell(tr, absent(verdict.margin) ? MISSING : signedPts(verdict.margin * 100),
        absent(verdict.margin));
      cell(tr, num(region.pop_total));
      ["hh_mobile_phone", "phone_own_f", "literacy_f", "hh_electricity"]
        .forEach(function (key) { cell(tr, pct(region[key]), absent(region[key])); });

      body.appendChild(tr);
    });
  }

  /* ---------------------------------------------------------------- detail */

  function fieldRow(region, key) {
    var meta = state.data.fields[key] || {};
    var value = region[key];
    var missing = absent(value);
    var display = missing ? MISSING
      : (key === "pop_total" ? num(value) : pct(value));

    return el("div", "field",
      '<div class="field-row">' +
      '<span class="field-label">' + (meta.label || key) + "</span>" +
      '<span class="field-value' + (missing ? " is-missing" : "") + '">' + display + "</span>" +
      "</div>" +
      '<div class="field-meta">' + (meta.source || "") +
      (meta.vintage ? ' <span class="vintage">&middot; ' + meta.vintage + "</span>" : "") +
      (meta.note ? "<br>" + meta.note : "") + "</div>");
  }

  function group(title, keys, region) {
    var wrap = el("div", "detail-group");
    wrap.appendChild(el("h4", null, title));
    keys.forEach(function (key) { wrap.appendChild(fieldRow(region, key)); });
    return wrap;
  }

  function comparison(head, leftNum, leftCap, rightNum, rightCap, foot) {
    return el("div", "compare",
      '<div class="compare-head">' + head + "</div>" +
      '<div class="compare-body">' +
      '<div class="compare-cell"><span class="num">' + leftNum + "</span>" +
      '<span class="cap">' + leftCap + "</span></div>" +
      '<div class="compare-cell"><span class="num">' + rightNum + "</span>" +
      '<span class="cap">' + rightCap + "</span></div>" +
      "</div>" +
      '<div class="compare-foot">' + foot + "</div>");
  }

  /* ------------------------------------- per-region wealth gradient (v2 core) */

  function regionGradient(region, key) {
    return ((region.quintiles || {})[key]) || null;
  }

  /* The headline number for a region. Given visual primacy over everything else
     because it is the one figure that answers the question the tool exists for:
     not how many people a channel misses, but which people. */
  function distortionBlock(region) {
    var g = regionGradient(region, constant("headline_indicator"));
    var wrap = el("div", "distortion-block");

    if (!g || absent(g.targeting_distortion)) {
      wrap.classList.add("distortion-block--absent");
      wrap.appendChild(el("div", "distortion-absent-head", "Targeting distortion unavailable"));
      wrap.appendChild(el("p", "distortion-absent-why",
        g && g.pending_reason ? g.pending_reason
          : "the regional wealth breakdown has not been computed"));
      if (g && g.ownership_by_quintile) {
        wrap.appendChild(quintileBars(g));
      }
      return wrap;
    }

    var d = g.targeting_distortion;
    var head = el("div", "distortion-head");
    head.appendChild(el("span", "distortion-num distortion-num--" + distortionClass(d),
      d.toFixed(2)));
    var side = el("div", "distortion-side");
    side.appendChild(el("div", "distortion-label", "Targeting distortion"));
    side.appendChild(el("div", "distortion-verdict",
      d < constant("distortion_alarm")
        ? "Remote enrollment here <strong>selects against</strong> the poorest fifth."
        : "The reachable pool roughly mirrors the population."));
    head.appendChild(side);
    wrap.appendChild(head);

    var bottomPool = g.reachable_pool_composition
      ? g.reachable_pool_composition[0] : null;
    if (bottomPool) {
      wrap.appendChild(el("p", "distortion-sentence",
        "The poorest fifth is <strong>" + share(bottomPool.population_share) +
        "</strong> of this region's population but <strong>" +
        share(bottomPool.pool_share) + "</strong> of everyone a household phone " +
        "reaches. Ownership runs " + pct(g.bottom_group_rate) +
        " in the bottom " + groupWord("bottom_group") + " quintiles against " +
        pct(g.top_group_rate) + " in the top " + groupWord("top_group") +
        " — a gap of <strong>" + signed(g.exclusion_gap) + " points</strong>."));
    }

    wrap.appendChild(quintileBars(g));

    if (!absent(g.targeting_distortion_bottom2)) {
      wrap.appendChild(el("p", "footnote",
        "On the bottom <em>two</em> quintiles together — roughly twice the sample, and " +
        "the more robust reading where a single cell is thin — the distortion is " +
        "<strong>" + g.targeting_distortion_bottom2.toFixed(2) + "</strong>."));
    }
    return wrap;
  }

  function quintileBars(g) {
    var cells = g.ownership_by_quintile || [];
    var wrap = el("div", "region-quintiles");
    wrap.appendChild(el("h4", null, "Household phone ownership by wealth quintile"));

    var scale = barScale(cells.map(function (c) { return c.value; }));

    cells.forEach(function (c, i) {
      wrap.appendChild(barRow(QUINTILE_LABEL[i], c.value, QUINTILE_RAMP[i], scale, {
        cases: c.cases_unweighted,
        flagged: c.flagged,
        title: QUINTILE_LABEL[i] + ": " +
          (absent(c.value)
            ? "suppressed — only " + c.cases_unweighted + " unweighted cases, below the " +
              "floor of " + constant("min_cases_suppress")
            : pct(c.value) + " on " + c.cases_unweighted + " unweighted cases" +
              (c.flagged ? ", below the reliability threshold of " +
                constant("min_cases_flag") : ""))
      }));
    });

    var suppressed = (g.suppressed_quintiles || []).length;
    var flagged = (g.flagged_quintiles || []).length;
    if (suppressed || flagged) {
      wrap.appendChild(el("p", "footnote",
        (suppressed ? "<strong>" + suppressed + " cell(s) suppressed</strong> — under " +
          constant("min_cases_suppress") + " unweighted cases. " : "") +
        (flagged ? "<strong>" + flagged + " cell(s) flagged ⚠</strong> — under " +
          constant("min_cases_flag") + " cases, so the rate is shown but is " +
          "unreliable. " : "") +
        "Wealth quintiles are national, so a poor region holds few rich households and " +
        "a rich one few poor households. Thin cells are expected here, not exceptional."));
    }
    return wrap;
  }

  function renderDetail(classified, r) {
    var panel = $("detail"), empty = $("detail-empty");
    if (!state.selected) { panel.hidden = true; empty.hidden = false; return; }
    var row = classified.filter(function (x) {
      return x.region.region_id === state.selected;
    })[0];
    if (!row) { panel.hidden = true; empty.hidden = false; return; }
    var region = row.region;

    empty.hidden = true;
    panel.hidden = false;
    panel.innerHTML = "";

    var verdict = row.verdict;

    panel.appendChild(el("div", "detail-head",
      "<h3>" + region.name + "</h3>" +
      '<span class="verdict verdict--' + verdict.kind + '">' + LABEL[verdict.kind] + "</span>"));

    var reason = el("p", "detail-reason");
    if (verdict.share === null) {
      reason.textContent = "The basis you selected has no value for this region, so no " +
        "recommendation is made. It is not being treated as zero.";
    } else if (r === null) {
      reason.textContent = "Enter both costs to get a recommendation.";
    } else {
      reason.innerHTML = "Reachable share is <strong>" + share(verdict.share) +
        "</strong>. Your costs put the line at <strong>" + (r * 100).toFixed(1) +
        "%</strong>. " + (verdict.kind === "tipping"
          ? "That is inside the 5-point band either side of the line, so this region " +
            "flips on small changes to your cost assumptions."
          : verdict.kind === "remote"
            ? "Remote-first is the cheaper route, by " +
              (verdict.margin * 100).toFixed(1) + " points."
            : "In-person is the cheaper route, by " +
              Math.abs(verdict.margin * 100).toFixed(1) + " points.");
    }
    panel.appendChild(reason);

    // The headline metric goes directly under the verdict, above everything else.
    panel.appendChild(distortionBlock(region));

    if (region.hh_mobile_phone !== null && region.phone_own_f !== null) {
      var gap = region.hh_mobile_phone - region.phone_own_f;
      panel.appendChild(comparison(
        "Phone access: two measurements of the same thing",
        pct(region.hh_mobile_phone),
        "of households contain a mobile phone (DHS " + state.data.sources.dhs.survey_year + ")",
        pct(region.phone_own_f),
        "of women personally own one (DHS " + state.data.sources.dhs.survey_year + ")",
        "A gap of <strong>" + gap.toFixed(1) + " points</strong>. Both are correct; they " +
        "measure different things. If the people you enroll are women, the second number " +
        "is the one that constrains you."
      ));
    }

    if (state.basis === "phone_and_literacy_f" &&
        region.phone_and_literacy_f_lower !== null &&
        region.feasibility_bases.phone_and_literacy_f !== null) {
      var hi = region.feasibility_bases.phone_and_literacy_f / 100;
      var lo = region.phone_and_literacy_f_lower / 100;
      var straddles = r !== null && lo <= r && r <= hi;
      panel.appendChild(comparison(
        "Owning a phone and being literate: a range, not a number",
        pct(region.feasibility_bases.phone_and_literacy_f),
        "if the two conditions overlap as much as they possibly can",
        pct(region.phone_and_literacy_f_lower),
        "if they overlap as little as they possibly can",
        "The survey reports each condition separately and never crosses them, so the " +
        "joint share is unknowable from published tables. The map uses the optimistic " +
        "end. " + (straddles
          ? "<strong>Your cost line falls inside this range.</strong> The recommendation " +
            "above rests entirely on an assumption the data does not support. Treat this " +
            "region as unanswered."
          : "Your cost line falls outside this range, so the recommendation holds at " +
            "either end of it.")
      ));
    }

    var groups = el("div", "detail-groups");
    groups.appendChild(group("Survey-reported access", [
      "hh_mobile_phone", "phone_own_f", "phone_own_m", "hh_electricity"], region));
    groups.appendChild(group("Ability and payout rails", [
      "literacy_f", "literacy_m", "internet_f", "internet_m",
      "mobile_money_f", "mobile_money_m", "bank_account_f", "bank_account_m"], region));
    groups.appendChild(group("Population", ["pop_total"], region));
    panel.appendChild(groups);
  }

  /* --------------------------------------------------------------- summary */

  function renderSummary(classified, r) {
    var counts = { remote: 0, inperson: 0, tipping: 0, missing: 0 };
    classified.forEach(function (row) { counts[row.verdict.kind] += 1; });

    if (r === null) {
      $("summary").textContent = "Enter both costs above to see a recommendation.";
      return;
    }

    var parts = ["At your current costs the line sits at <strong>" +
      (r * 100).toFixed(1) + "%</strong>."];
    parts.push("<strong>" + counts.remote + "</strong> region" +
      (counts.remote === 1 ? " clears" : "s clear") + " it, <strong>" + counts.inperson +
      "</strong> " + (counts.inperson === 1 ? "falls" : "fall") + " short");
    parts.push(counts.tipping
      ? "and <strong>" + counts.tipping + "</strong> sit within five points of it — those " +
        "flip on small changes to your assumptions."
      : "and none is within five points of it.");
    if (counts.missing) {
      parts.push("<strong>" + counts.missing + "</strong> region" +
        (counts.missing === 1 ? " has" : "s have") +
        " no value on this basis and get no recommendation.");
    }
    $("summary").innerHTML = parts.join(" ");
  }

  /* ---------------------------------------------------------------- chrome */

  function renderStatic() {
    var d = state.data;
    text($("generated"), d.generated);
    text($("verified"), d.verified_on);
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-bind="region-count"]'),
      function (node) { text(node, d.regions.length); });
    text($("dhs-year"), d.sources.dhs.survey_year);
    text($("worldpop-year"), d.sources.worldpop.year);

    var sources = el("ul", "source-list");
    [
      ["DHS Program", "Survey " + d.sources.dhs.survey_id + ", " +
        Object.keys(d.sources.dhs.indicators).length +
        " indicators — subnational values, national wealth-quintile breakdown, region geometry",
        d.sources.dhs.survey_year + " · Terms of use, attribution"],
      ["WorldPop", "Constrained population raster, " + d.sources.worldpop.resolution,
        d.sources.worldpop.year + " (modelled) · CC BY 4.0"],
      ["Global Findex", "National account ownership, via the World Bank Indicators API",
        "latest " + d.national.findex.account_ownership.latest_year + " · CC BY 4.0"]
    ].forEach(function (row) {
      sources.appendChild(el("li", null,
        '<span class="what">' + row[0] + "</span> — " + row[1] +
        '<br><span class="meta">' + row[2] + "</span>"));
    });
    $("sources").innerHTML = "";
    $("sources").appendChild(sources);
    $("sources").appendChild(el("p", "footnote",
      "<strong>Removed in v2:</strong> Ookla Open Data. A crowdsourced measure of digital " +
      "activity is biased along the same axis as the exclusion this tool measures, so it " +
      "made the tool most confident where it should have been least. The fetch script and " +
      "the full reasoning are kept in <code>attic/</code>."));

    var findex = d.national.findex.account_ownership;
    var series = el("ul", "findex-series");
    findex.observations.slice().reverse().forEach(function (obs) {
      series.appendChild(el("li", null,
        '<span class="yr">' + obs.year + '</span><span class="val">' +
        obs.value.toFixed(1) + "%</span>"));
    });
    var findexNote = el("p", "footnote", findex.indicator_name + ". " +
      "Findex is a periodic survey, so the years between these are genuinely absent " +
      "rather than flat, and are not drawn. The fall between " + findex.observations[1].year +
      " and " + findex.observations[0].year + " is as published and has not been smoothed.");
    $("findex").innerHTML = "";
    $("findex").appendChild(series);
    $("findex").appendChild(findexNote);

    var options = $("basis-options");
    options.innerHTML = "";
    BASES.forEach(function (basis) {
      var label = el("label", "basis-option",
        '<input type="radio" name="basis" value="' + basis.key + '"' +
        (basis.key === state.basis ? " checked" : "") + ">" +
        '<span><span class="name">' + basis.name + "</span>" +
        '<span class="desc">' + basis.desc + "</span></span>");
      label.querySelector("input").addEventListener("change", function () {
        state.basis = basis.key;
        render();
      });
      options.appendChild(label);
    });
  }

  function renderBasisNote() {
    var note = $("basis-note");
    if (state.basis === "phone_and_literacy_f") {
      var r = costRatio();
      var straddling = r === null ? 0 : state.data.regions.filter(function (region) {
        var hi = region.feasibility_bases.phone_and_literacy_f;
        var lo = region.phone_and_literacy_f_lower;
        return hi !== null && lo !== null && lo / 100 <= r && r <= hi / 100;
      }).length;

      note.innerHTML =
        "<strong>The map does not change when you select this.</strong> Women's personal " +
        "phone ownership is lower than women's literacy in every one of the " +
        state.data.regions.length + " regions, so the optimistic bound — " +
        "min(phone, literacy) — is always just the phone figure. Literacy never binds " +
        "first. That is a finding, not a bug.<br><br>" +
        "What does change is the <em>uncertainty</em>. The DHS tables report the two " +
        "conditions separately and never cross them, so the joint share lies somewhere " +
        "between max(0, phone + literacy − 1) and min(phone, literacy). Those bounds are " +
        "far apart. " +
        (r === null ? "" :
          "<strong>" + straddling + " region" + (straddling === 1 ? "" : "s") +
          "</strong> currently " + (straddling === 1 ? "has a range that straddles"
            : "have ranges that straddle") + " your cost line, meaning the recommendation " +
          "there depends entirely on an overlap nobody measured. ") +
        "Each region's detail shows both bounds.";
    } else if (state.basis === "phone_own_f") {
      note.textContent = "Individual ownership among women. In every region this is well " +
        "below the household figure, and the difference is the point.";
    } else {
      note.textContent = "Household ownership is an upper bound on reachability, not a " +
        "measure of it. A phone in the house is not a phone in the hand of the person " +
        "being enrolled.";
    }
  }

  function select(regionId) {
    state.selected = state.selected === regionId ? null : regionId;
    render();
  }

  function render() {
    var r = costRatio();
    // Classified once, then handed to all four consumers. Each of them used to
    // recompute the same verdict for the same 23 regions.
    var classified = classifyAll(r);
    text($("ratio"), r === null ? MISSING : r.toFixed(2));
    renderBasisNote();
    renderSummary(classified, r);
    paintMap(classified);
    renderTable(classified);
    renderDetail(classified, r);
  }

  /* -------------------------------------------------------------------- go */

  // The Astro page embeds pipeline/data/regions.json verbatim in a
  // <script type="application/json"> tag at build time. Reading it here is
  // synchronous and can't 404 the way a fetch could; the try/catch is only for
  // the case where the tag is missing or malformed (e.g. this script loaded
  // outside the page that provides it).
  try {
    var dataEl = document.getElementById("regions-data");
    if (!dataEl) throw new Error("no #regions-data element on the page");
    var data = JSON.parse(dataEl.textContent);

    state.data = data;
    $("app").hidden = false;
    renderStatic();
    renderGradient();
    renderPending();
    shapes = buildMap(data.regions);

    ["cost-remote", "cost-inperson"].forEach(function (name) {
      $(name).addEventListener("input", render);
    });

    render();
  } catch (err) {
    $("load-error").hidden = false;
    if (window.console) window.console.error(err);
  }
})();

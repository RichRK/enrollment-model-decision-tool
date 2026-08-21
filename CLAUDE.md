# CLAUDE.md

## Data handling — restricted source

This repo uses DHS Program survey microdata obtained under a signed agreement.
Record-level data must never be redistributed, directly or within any tool or
dashboard.

- NEVER commit anything under `pipeline/data/raw/` or `pipeline/data/interim/`, and never commit
  `.DTA`, `.SAV`, `.SAS7BDAT` or equivalent files. Check `git status` before
  every commit. Never run a bare `git add -A` in this repo.
- Only aggregates may be published. `regions.json` and the site contain
  percentages and counts by region and wealth quintile — never per-household or
  per-individual rows.
- Cell suppression is mandatory, not configurable: flag cells under 50 unweighted
  cases, suppress under 25. Do not add an option to disable this.
- Never output anything at cluster or enumeration-area level, and never attempt
  to link records to an external individual-level source.
- Do not share the data files with anyone, including collaborators. Do not copy
  them outside the local working directory. Do not paste their contents into
  logs, error reports, issue text or messages.
- Scope is limited to the registered project: phone ownership, literacy and
  electricity access by region and wealth quintile in Madagascar, and its
  implications for enrollment modality. Other uses need a new DHS project
  request — flag to the project owner rather than proceeding.
- The published site must stay non-commercial: no analytics, tracking,
  advertising, lead capture or email collection.
- Every published output must credit The DHS Program and name the survey and its
  year.

Full terms and rationale: `pipeline/docs/dhs-data-terms-constraints.md`.
If unsure whether something is permitted, stop and ask the project owner.

### Why this matters here specifically

`origin` is a **public GitHub repository**. Restricted data pushed there stays in
the history after deletion. Before pushing, run:

```bash
make check-data
```

It runs two independent audits: `pipeline/check_data.py` checks that
`pipeline/data/raw/` and `pipeline/data/interim/` stay invisible to git and
that `pipeline/data/regions.json` carries an unweighted case count on every
published cell with nothing below the suppression floor; `site/tests/check-data.test.js`
(`bun test`) checks the built site for DHS attribution and for any tracking or
external resource. Neither needs to see the other's tree.

Both audits are also wired into the builds themselves, not just this manual
command: `run_all.py` runs `check_data.run()` as its last step, so `make
build`'s pipeline half fails if the audit fails even though nothing raised an
exception building the file; `site/package.json`'s `build` script is `astro
build && bun test tests/check-data.test.js`, so `bun run build` fails the
same way. `make check-data` still exists as a standalone command — it's the
fast path when you want the audit without a full rebuild.

---

## What this project is

A static page scoring each of Madagascar's 23 DHS survey regions on whether
enrollment can be done remotely, and on *who* remote enrollment
would exclude. The headline metric is `targeting_distortion`: the poorest
quintile's share of everyone a channel reaches, divided by their share of the
population. Below 1.0 means the channel selects against the poor.

Read `README.md` first; it leads with limitations rather than features, which is
deliberate.

## Build

Two toolchains, kept as siblings on purpose — see `site/README.md` for why the
frontend isn't just templated inside the Python pipeline.

- **Pipeline** (`pipeline/` — its own `pyproject.toml`/`uv.lock`, plus
  `pipeline/data/` and `pipeline/docs/`): Python 3.12+, managed via
  [uv](https://docs.astral.sh/uv/). Produces `pipeline/data/regions.json`, the
  pipeline's only output and the site's only input. `pipeline/check_data.py`
  is its own data-agreement audit, self-contained to this directory.
- **Site** (`site/`): Astro, managed via [bun](https://bun.sh) rather than npm.
  Astro reads `pipeline/data/regions.json` off disk at build time and inlines
  it into the page — no copy of the file, no runtime fetch. `site/src/scripts/app.js`
  is the interactive part (the cost calculator, map, sortable table); it's
  carried over from the pre-Astro version essentially unchanged.
  `site/tests/check-data.test.js` (`bun test`) is this side's own audit —
  attribution and no tracking/external-resources in the built output.
  `site/e2e/` (`make test-e2e`) is a Playwright suite over the built site — behaviour
  and data rendering, run on demand, never part of the build. Two runners, two
  directories: see `site/README.md` for why they must not see each other's files.

`make build` runs both, in order: the pipeline first (it produces the input the
Astro build needs), then `cd site && bun run build`. `make rebuild` discards the
pipeline's cache first. Without `make`: `cd pipeline && uv run python
run_all.py --clean` then `cd site && bun run build`. `make serve` serves the
production build (`site/dist`, via `astro preview`) at <http://localhost:4321/>
— that's what `make check-data` audits, so it's what to screenshot when
verifying a change. For iterative editing, `bun run dev` in `site/` re-reads
`pipeline/data/regions.json` on every request instead of needing a rebuild.

## Verifying the site — take a screenshot, every time

**Never report a visual change as verified without looking at a rendered image of
it.** Querying the DOM is not looking. Neither is reading computed styles, counting
elements, or checking contrast ratios — all of those can pass on a page that is
visibly broken, and on this project they did.

Use Playwright. It needs no repo dependency and leaves nothing behind. Run
`make build` then `make serve` first, then:

```bash
npx --yes playwright install chromium
```

```bash
npx --yes playwright screenshot --viewport-size "1280,900" --wait-for-timeout 2000 http://localhost:4321/ "$TEMP/page.png"
```

Screenshot diffing across two separate browser launches has a real false-positive
rate even on genuinely identical output — full-page capture stitches tall pages
together, and text can rasterize a subpixel differently between runs with nothing
in the DOM actually different. If a diff looks suspicious but a crop looks
identical by eye, corroborate with the DOM before concluding it's a real
regression: compare `getBoundingClientRect()`/`getComputedStyle()` on the
affected element between the two pages (the Claude Browser tools' `javascript_tool`
can do this directly), and diff before-vs-before (same page, two loads) as a
noise-floor control. This is what settled it the one time it came up — the pixel
diff turned out to come from the screenshot tool, not the page.

Write the image **outside the repo** — `$TEMP` on Windows, `/tmp` elsewhere. A
stray PNG in the working tree is not a data-agreement problem, but it is noise in
`git status`, and `git status` is the thing that has to stay readable here.

Then actually open the image. For one section rather than the whole page, a short
script beats the CLI — `page.$('#result')` then `el.screenshot({path})`. Check at
1280 and at 375 wide.

## Standing rules in this codebase

- **Missing means missing.** A null from a source stays null into `regions.json`
  and renders as "—". Never interpolate, never substitute a national figure for a
  regional one. Substituting the national wealth gradient for a regional one would
  reproduce precisely the error this tool exists to expose.
- **Verify identifiers against the live API, every run.** `fetch_dhs.py` re-checks
  the survey, every indicator id, the region count, and that no indicator returns
  the same value for all regions. That last check exists because `ED_LITR_W_TOT`
  ("Women's literacy: Total") is the total row of a distribution table and returns
  `100.0` everywhere — it resolves, returns data, and is inert. See
  `pipeline/docs/01-verification.md` §2.
- **The DHS geometry endpoint needs `f=json`, not `f=geojson`.** The geojson
  variant returns valid GeoJSON with empty coordinate arrays; it fails silently.
- **No connectivity layer.** Ookla was removed in v2 and must not be reintroduced;
  `attic/README.md` explains why at length. Any replacement must be supply-side.
- **No invented numbers.** No weighted composite indices, no cost estimates. Costs
  are user-supplied placeholders. Where two conditions must be combined and the
  survey never crosses them, show both Fréchet bounds rather than a point estimate.
- **Documented constants over magic numbers.** Every judgement call lives in
  `pipeline/config.py` with the reasoning next to it.
- **Reproduce, don't review.** Anything computed from the microdata that DHS has
  already published is asserted against the API, and the build stops on
  disagreement. That check has caught two definition errors that were plausible,
  widely documented and wrong for this survey — `ED_LITR_W_TOT` and the literacy
  education clause. Neither was findable by reading the code.
- **Look at the page.** See *Verifying the site* above. The same principle as the
  rule before it: check the output, not your reasoning about the output.
- **Keep comments succinct.** Evaluate whether the comments you're leaving are overly
  verbose, or unnecessarily document previous history that no longer reflects the
  current state of the repo.

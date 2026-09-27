# Enrollment model decision tool — Madagascar

## The question

Remote enrollment scales; in-person enrollment reaches people that remote
enrollment cannot. **v3 asks who could enroll by phone, and where they live.**
Madagascar is split into about 43,000 squares of 2.4 km. Each square gets the
share of its people who could enroll by phone, from the DHS 2021 phone-ownership
rate for its survey region and wealth fifth, and a head count from WorldPop. A
wealth slider narrows the answer to the poorest people in the country, because
phone ownership falls fastest exactly where a targeted programme most needs to
reach.

The rate is split by wealth because a regional average hides the composition of
who is excluded: two regions with the same phone ownership can miss the poor at
very different rates. That was v2's headline (`targeting_distortion`, still
computed in `regions.json`); v3 puts the same split on a map instead of a table.

## Limitations, first

- **Blank areas on the map.** Squares exist only where Meta's Relative Wealth
  Index gives a score, and Meta scored only squares it treated as populated.
  WorldPop puts about 7% of Madagascar's people (2.1M) in the blank areas, mostly
  thinly settled countryside. They are left out of every figure, and they may be
  the hardest people to reach.
- **Squares outside the survey regions.** About 3,470 people live in coastal
  squares that fall outside every DHS region's boundary, even after snapping
  squares within 0.03° to the nearest region. They have no survey figure and
  show in grey. Nothing is substituted for them.
- **"At most".** A phone is necessary for remote enrollment, not sufficient.
  Literacy, an ID for the SIM, trust and signal coverage all lower the number,
  and none of them is included.
- **The wealth index and the survey disagree about who is poor.** In the median
  region, 16% of people fall in a different wealth fifth under Meta's index than
  under DHS. The page shows a range: the upper figure uses the next-richer
  fifth's phone rate.
- **Neighbouring squares often share a score.** The survey reports by region and
  wealth fifth only, so scores take at most 115 values. The map shows where each
  applies, not variation within a region.
- **Merged fifths.** Where a region has fewer than 25 survey cases in one wealth
  fifth, that fifth is published together with its neighbour as one figure, so
  its own rate can't be recovered from the region's total. This happens in four
  regions, and the shared figure leans towards the better-sampled fifth — it may
  overstate phone reach for the thin one.
- **DHS data is self-reported and from 2021.** Ownership has almost certainly
  risen. Whether the wealth gradient has flattened is not knowable from this data.
- **Personal ownership pools women and men equally.** With household members
  switched off, the rate is adults aged 15–49 who own a phone themselves. Women's
  ownership is far lower than men's, and the pooled figure hides that.
- **Phone sharing is a guess you supply.** "Phone owners also enroll" lets each
  owner enroll 0–2 others; the survey says nothing about how often that happens.
- **Regions are DHS survey regions**, which will not match operational areas, and
  Madagascar's administrative divisions have changed since 2021.
- **Population is modelled**, not counted — WorldPop 2025 constrained. Last census
  2018.

### The aggregate API cannot produce the regional split, which was checked not assumed

`breakdown=all` returns 38 rows for Madagascar — 1 total + 2 residence + 5 quintile
+ 30 region — the union of the breakdowns, not their cross product. No row carries
both a populated `RegionId` and a non-Region characteristic, `ByVariableId` is empty
on every row of every indicator tested, and `/characteristics` returns HTTP 501.
Evidence in [`pipeline/docs/02-crosstab.md`](pipeline/docs/02-crosstab.md). Hence the microdata.

### What the national figures show

Computed from the API's wealth-quintile breakdown, DHS 2021, all regions pooled:

| Channel | Poorest | Richest | Targeting distortion |
|---|---|---|---|
| Household owns a mobile phone | 14.7% | 93.3% | **0.27** |
| Woman owns a mobile phone | 5.0% | 73.0% | **0.14** |
| Man owns a mobile phone | 17.5% | 77.5% | **0.37** |
| Woman used mobile money | 1.7% | 48.7% | **0.09** |
| Man used the internet (12m) | 0.9% | 55.2% | **0.05** |
| Woman is literate | 41.1% | 94.9% | **0.54** |
| Household has electricity | 0.4% | 93.0% | **0.01** |

Targeting distortion is the poorest fifth's share of everyone a channel reaches,
divided by its share of the population; below 1.0 means the channel selects
against the poor. The poorest fifth is 18.5% of Madagascar's population and about
5% of everyone a household phone can reach. The regional version, with its
seventeen-fold spread, is in [`pipeline/docs/03-recode.md`](pipeline/docs/03-recode.md).

## Restricted data — read before any commit

The microdata this project needs comes under a **signed DHS data agreement**, not an
open licence. `origin` is a public repository, so the constraints are operational
rather than theoretical.

The full terms and what they constrain are in
[`pipeline/docs/dhs-data-terms-constraints.md`](pipeline/docs/dhs-data-terms-constraints.md),
and the short version a future contributor will actually read is at the top of
[`CLAUDE.md`](CLAUDE.md). In brief:

- **Record-level data is never committed or redistributed** — not directly, and not
  inside any tool or dashboard. `pipeline/.gitignore` covers `data/raw/`,
  `data/interim/`; the root `.gitignore` covers the statistical-package extensions
  repo-wide. A DHS archive arriving with a filename those patterns miss is *not*
  protected: extend the relevant `.gitignore` rather than moving the file.
- **Only aggregates are published.** Percentages and unweighted counts by region and
  wealth quintile — never per-household or per-individual rows, never anything at
  cluster or enumeration-area level.
- **Cell suppression is mandatory and not configurable**: flag under 50 unweighted
  cases, suppress under 25. There is deliberately no option to turn it off.
- **The site stays non-commercial** — no analytics, tracking, advertising or data
  capture.
- **Standing obligation:** any resulting report or publication must be sent to
  `references@dhsprogram.com`. This is a condition of access, not a courtesy.

Before publishing:

```bash
make check-data
```

That audits what git can see, whether every published cell carries a usable
unweighted case count, whether anything falls below the suppression floor,
attribution, and whether the site has acquired any tracking. It is not decoration —
it caught a live problem on its first run, described next. It also isn't
optional in practice: the same audit runs as the last step of `pipeline/run_all.py`
and as part of `site/package.json`'s `build` script, so `make build` fails on
either side if the data it just produced doesn't pass. `make check-data` on
its own is the fast path when you want the audit without a full rebuild.

### A cell with no case count is not published

`CO_INUS_W_U12` (women's internet use in the past 12 months) is returned by the DHS
API **without an unweighted case count** — an empty string rather than a number, at
every breakdown level, so it is not recoverable. Under the agreement, a published
cell has to carry the count that demonstrates it is large enough to be
non-disclosive.

Its weighted denominators match `CO_MOBB_W_MOB` and `ED_LITR_W_LIT` exactly, both
drawn on the same base of women interviewed, so the unweighted counts are almost
certainly identical and could have been borrowed. That would have been reasoning
rather than evidence. **The indicator was withheld instead**, recorded in
`regions.json` under `national.wealth_gradient_withheld` so it was visibly absent
rather than quietly missing.

It cost the most striking card on the site — women's internet use had a targeting
distortion of 0.02.

## Working with the recodes

`pipeline/fetch_recode.py` reads `pipeline/data/raw/MDHR81DT/` and `pipeline/data/raw/MDIR81DT/` if
they are present and writes only suppressed aggregates. If they are absent — the
normal case for anyone without the agreement — it skips cleanly and the regional
fields stay pending, so the repository still builds for everyone else.

`make clean` and `make rebuild` deliberately **do not** delete the recode
directories. They remove only what a fetch step can put back; re-obtaining the
recodes means another approval from DHS.

**The correctness check is reproduction, not review.** Every figure the pipeline
computes that DHS has already published is checked against the aggregate API — the
national rate per quintile within 0.15 pp, the unweighted case counts exactly, and
the rate for all 23 regions within 0.15 pp. Any disagreement stops the build. The
regional check is what proves the region mapping; a mis-mapping leaves national
totals intact while scrambling the regions.

That check earned its place on the first run. The textbook DHS literacy definition
— "secondary schooling or higher, or can read a sentence" — is **wrong for this
survey**, because women with secondary education were still given the reading card;
93 of them were recorded as unable to read and the education clause counted them all
as literate. It overstated the richest quintile by 1.2 points. The correct
definition is the card result alone. Details in
[`pipeline/docs/03-recode.md`](pipeline/docs/03-recode.md) §3.

This is the same class of error as the `ED_LITR_W_TOT` bug in
[`pipeline/docs/01-verification.md`](pipeline/docs/01-verification.md) §2: plausible, widely
documented, and wrong here. Neither was catchable by reading the code.

## What is not done

Stated plainly rather than left to be discovered:

- **v2 Part 3 entirely** — travel time from the Malaria Atlas friction surfaces,
  settlement dispersion, `households_per_field_day`. Not blocked by anything; simply
  not yet built. Both MAP friction surfaces were confirmed available
  (`Accessibility__202001_Global_Walking_Only_Friction_Surface` and the motorised
  variant, via the MAP WCS endpoint), and Google Open Buildings v3 was confirmed
  reachable. The relevant constants are already in `pipeline/config.py`.
- **v2 Part 4 mixed-strategy output** — depends on Part 3. v3 dropped the v2 cost
  calculator; the page shows who could enroll by phone, not which channel is
  cheaper.
- **v2 Part 5 coverage layer** — explicitly stretch scope; not pursued.
- **The repointed `disagreement_flag`** — v2 asks for it to flag regions where the
  headline rate and the targeting distortion disagree. The data for it now exists;
  the flag does not. Atsinanana would be its first entry.

## How to rebuild

Requires **Python 3.12 or newer** and about 60 MB of downloads on a cold run.
Dependencies are managed with [uv](https://docs.astral.sh/uv/) — install it once per
machine (see the uv docs), then:

```bash
make venv
```

```bash
make build
```

For a genuine cold run that discards the cache first:

```bash
make rebuild
```

If you do not have `make` — which on Windows is the default — every target is a thin
wrapper around one script, run from inside `pipeline/` (that's where
`pyproject.toml`/`uv.lock` live):

```bash
cd pipeline && uv run python run_all.py --clean
```

`make build` also builds the site itself (`site/`, Astro via [bun](https://bun.sh)
— a separate toolchain from the pipeline above, kept as a sibling rather than
templated into it; see `site/README.md`). To view it:

```bash
make serve
```

Then open <http://localhost:4321/>. The page needs no `fetch` and makes no network
requests at all: `pipeline/data/regions.json` and `pipeline/data/squares.json` are
read once, at build time, and inlined directly into the HTML.

## What is in here

```
pipeline/pyproject.toml, uv.lock  this toolchain's own dependency manifest and lockfile
pipeline/config.py         verified ids, suppression rules, documented constants
pipeline/fetch_dhs.py      values, national quintiles, geometry — with id re-verification
pipeline/fetch_worldpop.py constrained population raster
pipeline/fetch_findex.py   one national reference series
pipeline/fetch_recode.py   RESTRICTED microdata in, suppressed aggregates out
pipeline/fetch_rwi.py      Meta's Relative Wealth Index, one row per 2.4 km square
pipeline/build.py          joins, wealth gradients, emits regions.json
pipeline/build_squares.py  squares: region, WorldPop count and national wealth fifth
pipeline/check_data.py     the pipeline half of the data-agreement audit behind `make check-data`
pipeline/data/regions.json committed output, ~1.1 MB
pipeline/data/squares.json committed output, ~1.6 MB, no DHS values in it
pipeline/docs/dhs-data-terms-...md  the agreement, and what it constrains
pipeline/docs/01-verification.md    v1 source verification, and the indicator bug it caught
pipeline/docs/02-crosstab.md        whether the API can cross region x quintile. It cannot.
pipeline/docs/03-recode.md          recode variables, the validation, and the regional results
site/                      the viewer: Astro, TypeScript, a canvas map, no UI framework
site/tests/check-data.test.js  the site half of the data-agreement audit (bun test)
CLAUDE.md                  restricted-data rules, first thing in the file
attic/                     Ookla, and why it was dropped
LICENSES.md                sources, attribution, and the microdata terms
```

### Notes on the implementation

**Identifiers are re-verified on every run.** `fetch_dhs.py` checks that the survey
still exists, that no newer standard DHS has appeared, that every configured
indicator id resolves, that all 23 region polygons come back non-empty, and that no
indicator returns the same value for every region.

That last check exists because v1 got it wrong. DHS publishes `ED_LITR_W_TOT`,
labelled "Women's literacy: Total", which reads like the right indicator and is in
fact the total row of a distribution table — `100.0` in all 23 regions. It exists,
resolves, returns data, and is inert. The literacy rate is `ED_LITR_W_LIT`. An
existence check passes the wrong column happily; a variance check does not.

**The DHS geometry endpoint is used with `f=json`, not `f=geojson`.** The geojson
variant returns structurally valid GeoJSON with empty coordinate arrays — it fails
silently. The json variant carries WKT.

**Missing means missing.** A null stays null through the pipeline, into
`regions.json`, and a square without a survey figure shows grey and counts in
neither total. Nothing is interpolated and no national figure is substituted for a
regional one.

**"Reachable share" is a choice, not an index.** Two readings are offered, each a
real DHS value: household phone ownership, and personal ownership among adults
15–49, women and men pooled equally. No
weighted composite anywhere, because the weights would have to be invented. A third
reading, "owns a phone and is literate", was dropped — the survey never crosses the
two conditions, so it could only be published as a pair of Fréchet bounds, and its
optimistic bound turned out to equal the phone figure in all 23 regions because
women's literacy exceeds women's phone ownership everywhere.

## Licence

Code is MIT. `pipeline/data/regions.json` is CC BY 4.0; `pipeline/data/squares.json`
is CC BY-NC 4.0, following the wealth index. See [LICENSES.md](LICENSES.md).

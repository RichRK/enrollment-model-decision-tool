# Enrollment model decision tool — Madagascar

## The question

Remote registration scales; in-person enrollment reaches households that remote
registration cannot. Organisations usually pick one per country. A regional
phone-ownership rate tells you the *size* of the
group remote enrollment would exclude; it says nothing about its *composition*. For
a programme targeted at poor households that is the whole question, because the
exclusion runs along the same axis as the eligibility criterion. Two regions can
report identical average ownership while one merely misses people and the other
selects against precisely the households the programme exists to reach.

## Limitations, first

### Four regions have no answer, and they are not random

The regional metric is computed, from the household and individual recodes.
**19 of 23 regions have a usable targeting distortion.** The other four do not:
Antananarivo capital (the survey records no bottom-quintile households at all),
Analamanga excluding capital (14 unweighted cases in the poorest quintile),
Analanjirofo (19), and Androy (18 in the *richest* quintile).

Wealth quintiles are national, so a wealthy region holds almost no bottom-quintile
households and a poor one almost no top-quintile households. The losses land at
both ends of the distribution — which is where a targeted programme most wants an
answer. Nothing is estimated in their place.

Where any cell in a region is suppressed, that region's distortion is withheld too.
It is a share of a total across five quintiles, and a total missing one of its parts
understates the denominator and flatters the result.

### The regional spread is the point

| | Distortion |
|---|---|
| National | 0.27 |
| Atsinanana | **0.04** |
| Menabe | **0.69** |

A seventeen-fold spread that the national figure erases. Atsinanana is the sharpest
case: household phone ownership of **46.3%**, close to the national average and
enough to clear the cost line under most cost ratios — while its poorest fifth is
12.1% of the population and **0.5%** of everyone that phone ownership reaches.

On women's personal phone ownership, Vakinankarata and Atsinanana both compute to
**0.00**.

### The aggregate API cannot produce this, which was checked not assumed

`breakdown=all` returns 38 rows for Madagascar — 1 total + 2 residence + 5 quintile
+ 30 region — the union of the breakdowns, not their cross product. No row carries
both a populated `RegionId` and a non-Region characteristic, `ByVariableId` is empty
on every row of every indicator tested, and `/characteristics` returns HTTP 501.
Hence the microdata.

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

The poorest fifth is 18.5% of Madagascar's population and about 5% of everyone a
household phone can reach. **The more digital the channel, the worse the
distortion** — 0.27 for a household phone, 0.14 for a personal one, 0.09 for mobile
money, 0.05 for internet use. And it is sexed as well as classed: personal phone
ownership distorts at 0.14 for women against 0.37 for men, so a phone-based channel
excludes poor women about 2.6 times as hard as poor men. The household-level
indicator hides that completely.

### Everything else

- **The cost model treats all excluded households as alike.** It assumes one
  in-person cost per enrollment regardless of who is being reached, when in practice
  the excluded households are disproportionately the remote, dispersed and poor
  ones — the expensive ones. Travel time and settlement dispersion are
  **not yet built**; see *What is not done*.
- **DHS data is self-reported and from 2021.** Ownership has almost certainly risen.
  Whether the *gradient* has flattened is not knowable from this data.
- **Household ownership is not personal access.** Individual ownership among women
  is far lower and is shown alongside it everywhere.
- **Regions are DHS survey regions**, which will not match operational areas, and
  Madagascar's administrative divisions have changed since 2021.
- **Population is modelled**, not counted — WorldPop 2025 constrained. Last census
  2018.
- **Both cost inputs are placeholders you supply.** No cost figure comes from any
  dataset.
- **Nothing here measures** identity documentation, trust, intra-household control
  of a phone, or network coverage.

## Restricted data — read before any commit

The microdata this project needs comes under a **signed DHS data agreement**, not an
open licence, and `origin` is a public repository. The rules are at the top of
[`CLAUDE.md`](CLAUDE.md); the full terms are in
[`pipeline/docs/dhs-data-terms-constraints.md`](pipeline/docs/dhs-data-terms-constraints.md).

- A DHS archive arriving with a filename the `.gitignore` patterns miss is *not*
  protected: extend the relevant `.gitignore` rather than moving the file.
- An indicator the API returns without an unweighted case count is not published,
  which is why women's internet use (`CO_INUS_W_U12`) is absent. Any indicator
  dropped this way is listed under `national.wealth_gradient_withheld` in
  `regions.json`.
- **Standing obligation:** any resulting report or publication must be sent to
  `references@dhsprogram.com`. This is a condition of access, not a courtesy.

Before publishing:

```bash
make check-data
```

The same audit runs as the last step of `make build`, on both the pipeline and the
site, so a build whose output fails it fails too.

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

That check caught a definition error on its first run: the textbook DHS literacy
definition is **wrong for this survey**. See the note on `RECODE_LITERACY` in
`pipeline/config.py`.

## What is not done

Stated plainly rather than left to be discovered:

- **Travel time and settlement dispersion** — pricing the households remote
  enrollment excludes by how expensive they are to reach, rather than at one flat
  in-person cost. Not blocked by anything; simply not yet built.
- **A combined mixed-strategy recommendation** — depends on the above. The tool
  shows the targeting distortion and a binary cost recommendation side by side
  instead.
- **A coverage layer** — not pursued.
- **A disagreement flag** for regions where the headline rate and the targeting
  distortion disagree. The data for it exists; the flag does not. Atsinanana would
  be its first entry.

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
requests at all: `pipeline/data/regions.json` is read once, at build time, and
inlined directly into the HTML.

## What is in here

```
pipeline/pyproject.toml, uv.lock  this toolchain's own dependency manifest and lockfile
pipeline/config.py         verified ids, suppression rules, documented constants
pipeline/fetch_dhs.py      values, national quintiles, geometry — with id re-verification
pipeline/fetch_worldpop.py constrained population raster
pipeline/fetch_findex.py   one national reference series
pipeline/fetch_recode.py   RESTRICTED microdata in, suppressed aggregates out
pipeline/build.py          joins, wealth gradients, emits regions.json
pipeline/check_data.py     the pipeline half of the data-agreement audit behind `make check-data`
pipeline/data/regions.json committed output, ~1.2 MB
pipeline/docs/dhs-data-terms-...md  the agreement, and what it constrains
site/                      the viewer: Astro, vanilla JS, inline SVG, no UI framework
site/tests/check-data.test.js  the site half of the data-agreement audit (bun test)
CLAUDE.md                  restricted-data rules, first thing in the file
LICENSES.md                sources, attribution, and the microdata terms
```

## Licence

Code is MIT. `pipeline/data/regions.json` is CC BY 4.0. See [LICENSES.md](LICENSES.md).

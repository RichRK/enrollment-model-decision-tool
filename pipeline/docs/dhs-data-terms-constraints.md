# DHS microdata — terms of use and what they constrain

**Read before touching any downloaded data file.**

Access to the Madagascar survey microdata was granted under a signed agreement.
Several clauses directly constrain how this repo is built and published. Two of
them are easy to breach by accident, and one of those is a plausible default
behaviour for an automated agent.

---

## 1. Never commit or redistribute the microdata

The binding clause:

> the DHS micro-level data will not be re-distributed, either directly or within
> any tool/dashboard

"Micro-level" means record-level data — one row per household, per woman, per
individual. Aggregate statistics computed from those records are not micro-level
data and may be published. That distinction is the whole basis on which this
project works.

**Allowed**

- `regions.json` containing percentages, rates and ratios by region and quintile
- Unweighted case counts per cell
- All pipeline and analysis code
- Charts, maps and write-ups derived from the aggregates

**Not allowed**

- The recode files themselves, in any format
- Any intermediate artefact with one row per household or per individual
- Any output granular enough to reconstruct records
- Any of the above committed to a public repository, bundled into the site,
  or included in a build output

---

## 2. Aggregates only in the published output

Everything reaching `regions.json` or the site must be an aggregate over a cell
with enough underlying records to be non-disclosive.

The suppression rules already in the v2 spec — flag under 50 unweighted cases,
suppress under 25 — were written for statistical reliability. They now serve a
second purpose: preventing cells small enough to be identifying. Treat them as
mandatory rather than advisory, and do not add a configuration option to disable
them.

Related clause:

> make no effort to identify any individual, household, or enumeration area

Do not attempt to link records to any external individual-level source, and do
not output anything at cluster or enumeration-area level.

---

## 3. Do not share the data files with anyone

> the datasets will not be shared with other researchers without the written
> consent of The DHS Program

Outputs, code and write-ups can be shared freely. The files cannot. Anyone who
wants the underlying data applies to DHS themselves — approval typically takes
about a day, so this is a minor step for them, not a blocker.

Practically: keep the raw files in the local working directory only. Do not copy
them to shared drives, public buckets, pastebins, or any location outside the
project owner's control. Do not include their contents in logs, error output,
issue reports, or messages.

---

## 4. Scope is limited to the registered project

> use the requested data only for the registered research or study

The approved project covers analysis of mobile phone ownership, literacy and
electricity access by region and wealth quintile in Madagascar, and its
implications for enrollment modality. Work outside that scope needs a new project
request — cheap to file, but it must be filed rather than assumed.

If an obvious extension appears mid-build, flag it to the project owner rather
than proceeding.

---

## 5. Non-commercial

> the data will not be used for any marketing or commercial venture

The output is a public, non-commercial methodological demonstration. Do not add
analytics, tracking, advertising, lead capture, email collection, or any
monetisation to the published site. Keep it a static artefact.

---

## 6. Attribution and reporting

Every published output must credit The DHS Program and name the specific survey
used, including its year. Add this to `LICENSES.md` alongside the existing
entries for the open geospatial sources.

There is also a standing obligation on the project owner to send any resulting
report or publication to `references@dhsprogram.com`. Note this in the README so
it is not forgotten — it is a condition of access, not a courtesy.

---

## 7. Checklist before any commit or publish

- [ ] `git status` shows no file from `pipeline/data/raw/` or `pipeline/data/interim/`
- [ ] No `.DTA`, `.SAV` or equivalent anywhere in the working tree that git can see
- [ ] `regions.json` contains only aggregates — no per-household rows
- [ ] Every cell in the output carries an unweighted count
- [ ] No cell under 25 unweighted cases is rendered
- [ ] Nothing is output at cluster or enumeration-area level
- [ ] DHS attribution present with survey name and year
- [ ] No tracking, analytics or data capture on the published site

---

## If in doubt

Stop and ask the project owner. The cost of pausing is an hour. The cost of
publishing restricted microdata to a public repository is a breached data
agreement and, quite possibly, revoked access.

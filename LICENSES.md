# Licences and attribution

Three sources, all CC BY 4.0 or equivalent.

---

## Sources

### DHS Program — aggregate API

- **Used for:** subnational indicator values, the national wealth-quintile
  breakdown, and region geometry for survey `MD2021DHS`, via
  `https://api.dhsprogram.com/rest/dhs/`.
- **Licence:** DHS Program Terms of Use. Free, no key, attribution required.
- **Attribution:** Demographic and Health Surveys (DHS) Program, **Madagascar
  Standard DHS 2021 (`MD2021DHS`)**. Data accessed via the DHS Program API on
  2026-08-05.

### DHS Program — survey microdata

- **Used for:** the regional wealth-quintile breakdown, once the household recode
  is available. See [`pipeline/docs/02-crosstab.md`](pipeline/docs/02-crosstab.md)
  for why the aggregate API cannot supply it.
- **Licence:** obtained under a **signed data agreement**, not an open licence.
  Full terms and what they constrain:
  [`pipeline/docs/dhs-data-terms-constraints.md`](pipeline/docs/dhs-data-terms-constraints.md).
- **Attribution:** Demographic and Health Surveys (DHS) Program, **Madagascar
  Standard DHS 2021 (`MD2021DHS`)**, Household Recode.

  The binding constraints, in short:

  - **Record-level data is never redistributed**, directly or inside any tool or
    dashboard. Only aggregates are published. Raw files stay in `pipeline/data/raw/`,
    which is gitignored.
  - **Cell suppression is mandatory, not configurable**: cells under 50 unweighted
    cases are flagged, under 25 suppressed. A cell whose unweighted count cannot be
    produced is not published at all — this already applies to women's internet use
    (`CO_INUS_W_U12`), which the API returns without one.
  - **Nothing is output at cluster or enumeration-area level**, and no attempt is
    made to identify any individual, household or enumeration area.
  - **The files are not shared with anyone.** Outputs, code and write-ups are free
    to share; the data is not. Anyone wanting it applies to DHS directly.
  - **Scope is limited to the registered project**: phone ownership, literacy and
    electricity access by region and wealth quintile in Madagascar, and the
    implications for enrollment modality.
  - **Non-commercial.** The published site carries no analytics, tracking,
    advertising or data capture, and `make check-data` verifies that.

  **Standing obligation on the project owner:** any resulting report or publication
  must be sent to `references@dhsprogram.com`. This is a condition of access, not a
  courtesy.

### WorldPop

- **Used for:** constrained population raster, Madagascar, 100 m, 2025 release
  (`mdg_pop_2025_CN_100m_R2025A_v1.tif`).
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Attribution:** WorldPop (www.worldpop.org), School of Geography and
  Environmental Science, University of Southampton. Global High Resolution
  Population Denominators Project. Constrained population estimates, Madagascar,
  2025 release R2025A.

### Global Findex, via the World Bank Indicators API

- **Used for:** one national reference series, `FX.OWN.TOTL.ZS` — account ownership
  at a financial institution or with a mobile-money provider, % of population 15+.
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Attribution:** Global Findex Database, World Bank. Retrieved via the World Bank
  Indicators API on 2026-08-05.

---

## What this repository is licensed under

**Code** — everything under `pipeline/`, `site/` (excluding its `node_modules/`,
which is third-party and not part of this repo's license) and `attic/`, plus the
`Makefile` — is **MIT**.

**Data** — `pipeline/data/regions.json` — is **CC BY 4.0**. Redistribute freely with
attribution to the three sources above. No NonCommercial restriction and no
ShareAlike obligation applies, following the removal of Ookla.

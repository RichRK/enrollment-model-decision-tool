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

- **Used for:** the regional wealth-quintile breakdown, which the aggregate API
  cannot supply.
- **Licence:** obtained under a **signed data agreement**, not an open licence.
- **Attribution:** Demographic and Health Surveys (DHS) Program, **Madagascar
  Standard DHS 2021 (`MD2021DHS`)**, Household Recode.

  What the agreement constrains, and how this repo complies:
  [`pipeline/docs/dhs-data-terms-constraints.md`](pipeline/docs/dhs-data-terms-constraints.md).
  Any resulting report or publication must be sent to `references@dhsprogram.com`.

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
which is third-party and not part of this repo's license), plus the `Makefile` —
is **MIT**.

**Data** — `pipeline/data/regions.json` — is **CC BY 4.0**. Redistribute freely with
attribution to the three sources above. No NonCommercial restriction and no
ShareAlike obligation applies.

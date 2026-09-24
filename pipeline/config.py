"""Verified source identifiers and documented model constants.

Everything in this file was checked against the live API or bucket on 2026-07-31.
Nothing here is a guess; if a lookup against these values returns nothing, the
fetch scripts fail loudly rather than carrying on with a hole in the data.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent  # this file's own directory (pipeline/)
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

VERIFIED_ON = "2026-07-31"

# ---------------------------------------------------------------------------
# DHS
# ---------------------------------------------------------------------------

DHS_BASE = "https://api.dhsprogram.com/rest/dhs/"

# Most recent standard DHS for Madagascar. Verified against /surveys?countryIds=MD.
DHS_SURVEY_ID = "MD2021DHS"
DHS_SURVEY_YEAR = 2021

# Verified against /indicators?surveyIds=MD2021DHS AND against the values the data
# endpoint actually returns. Both checks matter, and the literacy pair is why.
#
# DHS publishes a family of ED_LITR_* indicators that are the rows of a distribution
# table: _RDW (reads a whole sentence), _RDP (part of a sentence), _NRD (cannot read
# at all), _BLD (visually impaired), and _TOT. _TOT is the table's total row and is
# 100.0 for every region -- it is not a literacy rate. The literacy rate is _LIT,
# labelled "Women who are literate".
#
# An id existing in the catalogue therefore proves nothing about whether it holds
# what you want. fetch_dhs.py additionally rejects any indicator whose value is
# identical across all regions, which is what catches this specific mistake.
DHS_INDICATORS = {
    "hh_mobile_phone": "HC_HEFF_H_MPH",     # Households possessing a mobile telephone
    "hh_electricity": "HC_ELEC_H_ELC",      # Households with electricity
    "literacy_f": "ED_LITR_W_LIT",          # Women who are literate
    "literacy_m": "ED_LITR_M_LIT",          # Men who are literate
    "phone_own_f": "CO_MOBB_W_MOB",         # Women who own a mobile phone
    "phone_own_m": "CO_MOBB_M_MOB",         # Men who own a mobile phone
    "mobile_money_f": "CO_MOBB_W_SPT",      # Women who used a mobile phone for financial transactions
    "mobile_money_m": "CO_MOBB_M_SPT",      # Men who used a mobile phone for financial transactions
    "bank_account_f": "CO_MOBB_W_BNK",      # Women who have a bank account
    "bank_account_m": "CO_MOBB_M_BNK",      # Men who have a bank account
}

# The /data endpoint returns a hierarchy: 6 former provinces, 22 regions nested
# under them, and Analamanga split into capital / non-capital. The /geometry
# endpoint returns exactly the 23 leaf units. The geometry set is the unit of
# analysis; provinces and the Analamanga aggregate are dropped. The join is on
# RegionId, exact -- there is no name matching anywhere in this pipeline.
DHS_EXPECTED_REGIONS = 23

# Wealth quintile is the second dimension the tool needs, and the aggregate API
# cannot cross it with region -- verified 2026-08-05.
# `breakdown=all` returns the UNION of the breakdowns (1 total + 2 residence +
# 5 quintile + 30 region = 38 rows), never their cross product, and ByVariableId is
# empty on every row of every indicator tested. The regional quintile figures
# therefore require the household recode microdata; the national ones do not.
DHS_QUINTILES = ["Lowest", "Second", "Middle", "Fourth", "Highest"]

# DHS's own reporting conventions for thin cells, applied to region x quintile.
# Stated rather than invented: DHS flags estimates based on 25-49 unweighted cases
# and suppresses those based on fewer than 25.
MIN_CASES_FLAG = 50
MIN_CASES_SUPPRESS = 25

# ---------------------------------------------------------------------------
# DHS microdata recodes -- RESTRICTED, see CLAUDE.md before touching
# ---------------------------------------------------------------------------
#
# These files come under a signed data agreement. They live in data/raw/, which is
# gitignored, and nothing derived from them leaves this pipeline except aggregates
# that pass the suppression rules below. If the files are absent the build still
# runs; the regional quintile fields simply stay pending.

RECODE_HOUSEHOLD = RAW / "MDHR81DT" / "MDHR81FL.DTA"
RECODE_INDIVIDUAL = RAW / "MDIR81DT" / "MDIR81FL.DTA"

# Variable names verified against the survey's own .DTA metadata on 2026-08-05,
# not carried over from another country's survey.
RECODE_VARS = {
    "household": {
        "region": "hv024",      # region (23 categories -- includes the capital split)
        "wealth": "hv270",      # wealth index combined, 1..5
        "weight": "hv005",      # household sample weight, 6 implied decimals
    },
    "individual": {
        "region": "v024",       # region; v101 duplicates it, v139 is DE JURE and differs
        "wealth": "v190",
        "weight": "v005",       # women's individual sample weight, 6 implied decimals
    },
}

# Sample weights carry six implied decimal places in DHS recodes.
RECODE_WEIGHT_SCALE = 1_000_000.0

# Scope note: the registered project covers phone ownership, literacy and
# electricity access by region and wealth quintile. Only those are computed from
# the microdata. Mobile money, bank accounts and internet use are present in the
# recodes and are deliberately NOT computed here -- they would need the project
# scope extending first. The national-level versions on the site come from the
# public aggregate API, which is not covered by the agreement.
RECODE_INDICATORS = {
    "hh_mobile_phone": {"file": "household", "var": "hv243a", "api": "HC_HEFF_H_MPH"},
    "hh_electricity": {"file": "household", "var": "hv206", "api": "HC_ELEC_H_ELC"},
    "phone_own_f": {"file": "individual", "var": "v169a", "api": "CO_MOBB_W_MOB"},
    "literacy_f": {"file": "individual", "var": None, "api": "ED_LITR_W_LIT"},
}

# Literacy is the reading-card result alone: v155 in (1, 2). Nothing else.
#
# The textbook DHS definition is "secondary schooling or higher, OR can read a
# whole or partial sentence", and applying it here was WRONG -- it overstated the
# richest quintile by 1.2 points and Antananarivo capital by 2.2. The reason is
# visible in the survey's own v106 x v155 table: in Madagascar 2021 women with
# secondary or higher education were still administered the reading card, so the
# education clause is redundant, and it is worse than redundant because 93 women
# with secondary education were recorded as unable to read at all, plus 4 as
# visually impaired. The education clause counted all of them as literate; DHS does
# not.
#
# v155 in this survey takes 0 (cannot read at all), 1 (part of a sentence),
# 2 (a whole sentence) and 4 (blind/visually impaired). Code 3, "no card with the
# required language", does not occur. Women in 0 and 4 stay in the denominator.
#
# Reproduces ED_LITR_W_LIT to within 0.03 pp on every wealth quintile. Do not
# "improve" this by adding the education clause back; the assertion in
# fetch_recode.py will stop the build, which is the point.
RECODE_LITERACY = {
    "reading": "v155",
    "reading_literate": (1, 2),
}

# Recode region code -> DHS API RegionId. Explicit and auditable: the pipeline
# joins on RegionId and never on names. Drafted by name matching, then verified by
# reproducing the API's per-region values from the microdata.
#
# Two entries could not be settled by name and were resolved deliberately:
#   10/11  the recode splits Antananarivo (capital) from Analamanga (the rest),
#          matching the API's two Analamanga geometry units.
#   22     the recode says "amoron i mania"; the API spells it "Anamoroni'i Mania".
#          Confirmed by position -- code 22 sits between Haute Matsiatra (21) and
#          Vatovavy Fitovinany (23), and RegionId ...008 sits between ...007
#          (Haute Matsiatra) and ...009 (Vatovavy Fitovinany).
# Note also that the API spells code 12 "Vakinankarata", dropping an r from the
# recode's "vakinankaratra". Same region.
RECODE_REGION_TO_DHS = {
    10: "MDDHS2021426029",   # Antananarivo capital
    11: "MDDHS2021426030",   # Analamanga excluding capital
    12: "MDDHS2021426003",   # Vakinankarata
    13: "MDDHS2021426004",   # Itasy
    14: "MDDHS2021426005",   # Bongolava
    21: "MDDHS2021426007",   # Haute Matsiatra
    22: "MDDHS2021426008",   # Anamoroni'i Mania
    23: "MDDHS2021426009",   # Vatovavy Fitovinany
    24: "MDDHS2021426010",   # Ihorombe
    25: "MDDHS2021426011",   # Atsimo Atsinanana
    31: "MDDHS2021426013",   # Atsinanana
    32: "MDDHS2021426014",   # Analanjirofo
    33: "MDDHS2021426015",   # Alaotra Mangoro
    41: "MDDHS2021426017",   # Boeny
    42: "MDDHS2021426018",   # Sofia
    43: "MDDHS2021426019",   # Betsiboka
    44: "MDDHS2021426020",   # Melaky
    51: "MDDHS2021426022",   # Atsimo Andrefana
    52: "MDDHS2021426023",   # Androy
    53: "MDDHS2021426024",   # Anosy
    54: "MDDHS2021426025",   # Menabe
    61: "MDDHS2021426027",   # Diana
    62: "MDDHS2021426028",   # Sava
}

# How far a microdata-computed figure may sit from the published API figure before
# the build stops. The API publishes to one decimal place, so anything inside a
# rounding step is agreement; beyond it means a variable, a weight or a definition
# is wrong and the regional numbers cannot be trusted either.
RECODE_TOLERANCE_PP = 0.15

# ---------------------------------------------------------------------------
# WorldPop
# ---------------------------------------------------------------------------

# Constrained (built-settlement-masked) population, 100 m, 2025 release. Verified
# to exist and to be 57 MB. This is a MODELLED projection, not a census count --
# Madagascar's last census was 2018. The vintage travels to the UI as such.
WORLDPOP_URL = (
    "https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/MDG/"
    "v1/100m/constrained/mdg_pop_2025_CN_100m_R2025A_v1.tif"
)
WORLDPOP_YEAR = 2025

# ---------------------------------------------------------------------------
# World Bank / Global Findex
# ---------------------------------------------------------------------------

WORLDBANK_URL = "https://api.worldbank.org/v2/country/MDG/indicator/{indicator}?format=json&per_page=100"

# Verified to exist and to carry Madagascar values (2011, 2014, 2017, 2022, 2024).
FINDEX_INDICATORS = {
    "account_ownership": "FX.OWN.TOTL.ZS",
}

# Account ownership is the only national reference line: no Findex mobile-money or
# phone-ownership series has Madagascar values, and the ITU series that do are not used.

# ---------------------------------------------------------------------------
# Model constants -- each of these is a judgement call, so each carries its reasoning
# ---------------------------------------------------------------------------

# The wealth cut the UI defaults to. Quintiles are defined nationally, so a poor
# region holds almost no top-quintile households and a wealthy one almost no
# bottom-quintile households -- region x quintile cells get thin fast. Collapsing to
# bottom-two versus top-three roughly doubles cell sizes and loses little that the
# decision turns on. The full five-quintile view is available as a toggle, with
# suppression applied.
BOTTOM_GROUP = ["Lowest", "Second"]
TOP_GROUP = ["Middle", "Fourth", "Highest"]

# The indicator the region-level view leads on. Household phone ownership is the
# most generous reading of "reachable", so the distortion computed on it is the
# most favourable one available -- which is the point of leading with it.
HEADLINE_INDICATOR = "hh_mobile_phone"

# Threshold on `targeting_distortion` below which remote enrollment is treated as
# selecting against the target population rather than merely missing some of it.
#
# Why 0.8: at 1.0 the reachable pool mirrors the population. Sampling noise alone
# moves this by a few points in either direction on DHS-sized cells, so a threshold
# just below 1.0 would fire on nothing but noise. At 0.8 the bottom quintile is a
# fifth under-represented in the reachable pool, which is large enough to survive
# the noise and to matter operationally.
DISTORTION_ALARM = 0.8

# The second break in the same scale, used only to colour a figure amber rather
# than red. Why 0.4: it is the midpoint between the alarm threshold and zero, and
# nothing turns on it -- no verdict, no recommendation, no suppression. It exists
# so that a reader scanning the cards can tell "below the line" from "far below the
# line" at a glance, and it is stated here rather than left as a literal in the
# stylesheet's consumer because it is still a judgement call.
DISTORTION_WARN = 0.4

# Half-width of the band around the cost line inside which a region is reported as
# "near the line" rather than as a recommendation. Regions inside it flip on small
# changes to the user's cost assumptions, and saying so is more honest than
# returning a verdict that a rounding error would reverse.
TIPPING_BAND = 0.05

# Douglas-Peucker tolerance in degrees for the shapes shipped to the browser.
# 0.004 deg is roughly 440 m. The map renders Madagascar at under 1000 px across
# about 14 degrees of latitude, so this is well below one pixel and invisible.
SIMPLIFY_TOLERANCE = 0.004
COORD_PRECISION = 4  # ~11 m; more digits would only inflate the committed file

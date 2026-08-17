"""Verified source identifiers and documented model constants.

Everything in this file was checked against the live API or bucket on 2026-07-31.
See docs/01-verification.md for the evidence. Nothing here is a guess; if a lookup
against these values returns nothing, the fetch scripts fail loudly rather than
carrying on with a hole in the data.
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
    "internet_f": "CO_INUS_W_U12",          # Women who used the internet in the past 12 months
    "internet_m": "CO_INUS_M_U12",          # Men who used the internet in the past 12 months
}

# The /data endpoint returns a hierarchy: 6 former provinces, 22 regions nested
# under them, and Analamanga split into capital / non-capital. The /geometry
# endpoint returns exactly the 23 leaf units. The geometry set is the unit of
# analysis; provinces and the Analamanga aggregate are dropped. The join is on
# RegionId, exact -- there is no name matching anywhere in this pipeline.
DHS_EXPECTED_REGIONS = 23

# Wealth quintile is the second dimension the tool needs, and the aggregate API
# cannot cross it with region -- verified 2026-08-05, see docs/02-crosstab.md.
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
# not carried over from another country's survey. See docs/03-recode.md.
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

# The spec also asked for a national mobile-money-account figure and a national
# mobile-phone-ownership figure. Neither is retrievable:
#
#  * FX.OWN.TOTL.MO.ZS and FX.OWN.TOTL.PE.ZS are not real indicator ids.
#  * The Findex source (source 87) in the World Bank API is the 2017 vintage and
#    has no mobile-money series with Madagascar values.
#  * Data360, the spec's suggested alternative, returned 403 or 405 depending on
#    headers and method. It is not a dependency this tool should acquire.
#  * IT.CEL.SETS.P2 (mobile subscriptions) and IT.NET.USER.ZS (internet use) do
#    carry Madagascar values, but both are ITU-sourced series, and spec section
#    4.5 rules ITU out. They are deliberately not used.
#
# Per the "do not substitute a proxy without labelling it" rule, nothing stands in
# for them. Account ownership is the only national reference line. The subnational
# DHS data already carries mobile money use and phone ownership, sex-disaggregated,
# which is the more decision-relevant cut anyway.

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
# most favourable one available -- which is the point of leading with it. Named
# rather than repeated as a string literal: it was written out at eleven sites
# across Python and JavaScript, and nothing tied them together.
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

# ---------------------------------------------------------------------------
# STAGED, NOT WIRED UP -- nothing below this line is read by any code today.
#
# These are the constants for the travel-time and settlement-dispersion model:
# converting geography into a cost per enrollment, so that the residual left by a
# remote-first channel can be priced by how expensive its households actually are
# to reach rather than at one flat rate. The site names that as the weakest
# assumption on the page and says the fix is not yet built; this block is what it
# would be built from.
#
# Kept rather than deleted because the reasoning is the expensive part -- why 150
# households, why a cell-population floor exists at all, why walking rather than
# motorised is the default. Deleting the constants would mean re-deriving that.
#
# If you are looking for a live constant, it is above this line.
# ---------------------------------------------------------------------------

# Used to window the global rasters. Deliberately a little larger than the country.
# Note: fetch_worldpop.py currently asserts the raster's extent with its own
# literals rather than reading these.
MADAGASCAR_BBOX = {"lon_min": 43.0, "lon_max": 50.7, "lat_min": -25.8, "lat_max": -11.7}

# Malaria Atlas Project friction surfaces, 2020, ~1 km. Both variants are computed:
# in rural Madagascar the motorised assumption flatters the result badly, so walking
# is what the UI shows by default.
MAP_WCS = "https://data.malariaatlas.org/geoserver/Accessibility/ows"
MAP_COVERAGES = {
    "walking": "Accessibility__202001_Global_Walking_Only_Friction_Surface",
    "motorised": "Accessibility__202001_Global_Motorized_Friction_Surface",
}

# A populated cluster has to reach this many households before it is worth siting an
# enrollment point at. Below it, a team is walking between homesteads rather than
# working a queue.
#
# Why 150: at the DHS-reported mean household size this is roughly a village of
# 600-750 people, which is about the smallest settlement where a fixed enrollment
# point holds a full day's queue. It is a judgement call, it drives
# `dispersion_index` directly, and it is exposed in the UI for that reason.
CLUSTER_MIN_HOUSEHOLDS = 150

# Population per 100 m cell below which a cell is treated as unpopulated when
# growing clusters. WorldPop's constrained surface still spreads small fractional
# values over cells with almost nobody in them; without a floor, clusters bleed
# across the whole country through chains of near-empty cells.
CLUSTER_MIN_CELL_POP = 1.0

# --- households_per_field_day: the assumptions, all exposed in the UI -------
#
# This is the number that converts geography into cost, so every input to it is
# stated here rather than buried, and the two that matter most are user-adjustable.

# Hours an enrollment team works in the field per day, travel included.
FIELD_DAY_HOURS = 8.0

# Minutes of actual enrollment work per household, once a team is in front of one.
MINUTES_PER_HOUSEHOLD = 25.0

# A team travels to a cluster and back once per day. Travel time is the
# population-weighted walking time from households to their nearest qualifying
# cluster, doubled for the return leg.
RETURN_TRIP = True

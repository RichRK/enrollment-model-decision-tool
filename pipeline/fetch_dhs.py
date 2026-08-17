"""Fetch DHS subnational values and region geometry for Madagascar.

Every identifier is re-checked against the live API on each run. If the survey
disappears, or an indicator id stops resolving, or a region comes back without
geometry, the build stops here rather than emitting a hole.
"""

from config import (
    DHS_BASE,
    DHS_EXPECTED_REGIONS,
    DHS_INDICATORS,
    DHS_QUINTILES,
    DHS_SURVEY_ID,
    DHS_SURVEY_YEAR,
    RAW,
)
from common import fail, get_json, log, main, write_json

# The indicator id list, as the /data endpoint wants it. Both fetches below request
# the same set and differ only in their breakdown.
INDICATOR_IDS = ",".join(sorted(set(DHS_INDICATORS.values())))


def verify_survey():
    """Confirm the pinned survey still exists and is still the most recent standard DHS."""
    payload = get_json(DHS_BASE + "surveys?countryIds=MD&f=json")
    surveys = {row["SurveyId"]: row for row in payload.get("Data", [])}
    if DHS_SURVEY_ID not in surveys:
        fail("survey %s is no longer listed for Madagascar. Available: %s"
             % (DHS_SURVEY_ID, sorted(surveys)))

    survey = surveys[DHS_SURVEY_ID]
    if int(survey["SurveyYear"]) != DHS_SURVEY_YEAR:
        fail("survey %s reports year %s, config says %s"
             % (DHS_SURVEY_ID, survey["SurveyYear"], DHS_SURVEY_YEAR))

    newer = [s for s in surveys.values()
             if s["SurveyType"] == "DHS" and int(s["SurveyYear"]) > DHS_SURVEY_YEAR]
    if newer:
        fail("a newer standard DHS exists (%s). Update config and re-verify indicator ids "
             "before rebuilding -- do not silently keep using the older survey."
             % ", ".join(sorted(s["SurveyId"] for s in newer)))

    log("survey  %s (%s), confirmed most recent standard DHS" % (DHS_SURVEY_ID, DHS_SURVEY_YEAR))
    return survey


def verify_indicators():
    """Confirm every configured indicator id actually exists for this survey."""
    payload = get_json(
        DHS_BASE + "indicators?surveyIds=%s&f=json&perpage=20000" % DHS_SURVEY_ID)
    catalogue = {row["IndicatorId"]: row for row in payload.get("Data", [])}
    if not catalogue:
        fail("the indicator catalogue for %s came back empty" % DHS_SURVEY_ID)

    missing = {key: ind for key, ind in DHS_INDICATORS.items() if ind not in catalogue}
    if missing:
        fail("indicator ids not present in %s: %s. Do not guess replacements -- look them "
             "up in the catalogue and update config.py."
             % (DHS_SURVEY_ID, ", ".join("%s=%s" % (k, v) for k, v in sorted(missing.items()))))

    log("checked %d indicator ids against the live catalogue (%d indicators for this survey)"
        % (len(DHS_INDICATORS), len(catalogue)))
    return {ind: catalogue[ind] for ind in DHS_INDICATORS.values()}


def fetch_values():
    payload = get_json(
        DHS_BASE + "data?surveyIds=%s&indicatorIds=%s&breakdown=subnational&perpage=5000&f=json"
        % (DHS_SURVEY_ID, INDICATOR_IDS))
    rows = payload.get("Data", [])
    if payload.get("TotalPages", 1) > 1:
        fail("subnational response is paginated (%s pages); the fetch would silently truncate"
             % payload["TotalPages"])
    if not rows:
        fail("no subnational rows returned for %s" % DHS_SURVEY_ID)

    per_indicator = {}
    for row in rows:
        per_indicator.setdefault(row["IndicatorId"], []).append(row)
    empty = [ind for ind in DHS_INDICATORS.values() if not per_indicator.get(ind)]
    if empty:
        fail("indicators resolved but returned no subnational values: %s" % ", ".join(empty))

    # An id that exists and returns rows can still be the wrong column. Several DHS
    # indicator families are the rows of a distribution table, and the _TOT member of
    # such a family is the total row -- 100.0 in every region. It resolves, it returns
    # 30 rows, and it is useless. A percentage that does not vary across 30 regions is
    # not a regional statistic, so treat it as a configuration error and stop.
    for indicator, indicator_rows in per_indicator.items():
        values = {r["Value"] for r in indicator_rows if r.get("Value") is not None}
        if len(values) == 1:
            fail("indicator %s returns the same value (%s) for every region. That is "
                 "almost certainly the total row of a distribution table rather than a "
                 "rate -- check whether the family has a different member (for the "
                 "ED_LITR_* family, _LIT is the rate and _TOT is the 100%% total)."
                 % (indicator, values.pop()))

    log("values  %d rows across %d indicators, all varying across regions"
        % (len(rows), len(per_indicator)))
    return rows


def fetch_quintiles():
    """National ownership by wealth quintile.

    This is the only level at which the aggregate API can serve the wealth
    dimension. `breakdown=all` returns the UNION of the breakdowns -- one total row,
    two residence rows, five quintile rows and thirty region rows -- never their
    cross product, and ByVariableId is empty on every row. Verified 2026-08-05; the
    evidence is in docs/02-crosstab.md. Regional quintile figures need the household
    recode microdata.

    The unweighted denominators are carried through, because the suppression rules
    for the eventual regional version are defined on unweighted case counts and the
    national figures are what calibrates them.
    """
    payload = get_json(
        DHS_BASE + "data?surveyIds=%s&indicatorIds=%s&breakdown=background&perpage=5000&f=json"
        % (DHS_SURVEY_ID, INDICATOR_IDS))
    rows = payload.get("Data", [])
    if not rows:
        fail("no background-breakdown rows returned for %s" % DHS_SURVEY_ID)

    by_id = {indicator: key for key, indicator in DHS_INDICATORS.items()}
    out = {}
    for row in rows:
        if row.get("CharacteristicCategory") != "Wealth quintile":
            continue
        key = by_id.get(row["IndicatorId"])
        if key is None or row.get("Value") is None:
            continue
        out.setdefault(key, {})[row["CharacteristicLabel"]] = {
            "value": float(row["Value"]),
            "denominator_weighted": row.get("DenominatorWeighted"),
            "denominator_unweighted": row.get("DenominatorUnweighted"),
        }

    complete = {}
    dropped = {}
    for key, per_quintile in out.items():
        if set(per_quintile) != set(DHS_QUINTILES):
            dropped[key] = "returned %d of 5 quintiles" % len(per_quintile)
            continue

        # An unweighted case count is not optional here. It is what the suppression
        # rules are defined on, and under the DHS data agreement it is what makes a
        # published cell demonstrably non-disclosive. The API returns it as an empty
        # STRING for some indicators -- not null, not zero -- so a truthiness or
        # `in (None, 0)` test passes it straight through. Require a positive int.
        bad = [q for q, cell in per_quintile.items()
               if not isinstance(cell["denominator_unweighted"], int)
               or cell["denominator_unweighted"] <= 0]
        if bad:
            # Deliberately NOT inferred from another indicator sharing the same
            # denominator, even where the weighted denominators match exactly.
            # A case count that was reasoned to rather than reported is not
            # evidence that a cell is safe to publish.
            dropped[key] = ("no unweighted case count for %s (API returned %r)"
                            % (", ".join(sorted(bad)),
                               per_quintile[bad[0]]["denominator_unweighted"]))
            continue

        complete[key] = per_quintile

    for key, reason in sorted(dropped.items()):
        log("DROPPED %s from the wealth gradient: %s" % (key, reason))

    if not complete:
        fail("no indicator returned a full set of five wealth quintiles with case counts")

    log("quintiles %d indicators usable, %d dropped" % (len(complete), len(dropped)))
    return {"indicators": complete, "dropped": dropped}


def fetch_geometry():
    """Fetch region polygons.

    Deliberately uses f=json, not f=geojson. As of 2026-07-31 the geojson variant
    returns structurally valid GeoJSON with empty coordinate arrays -- it fails
    silently, which is the worst way for a geometry source to fail. The json
    variant carries WKT in `Coordinates`, and every feature is asserted non-empty
    below.
    """
    payload = get_json(DHS_BASE + "geometry/%s?f=json" % DHS_SURVEY_ID)
    rows = payload.get("Data", [])
    if not rows:
        fail("no geometry returned for %s" % DHS_SURVEY_ID)
    if len(rows) != DHS_EXPECTED_REGIONS:
        fail("expected %d region polygons for %s, got %d. The survey's region set has "
             "changed; re-verify before rebuilding."
             % (DHS_EXPECTED_REGIONS, DHS_SURVEY_ID, len(rows)))

    for row in rows:
        wkt = row.get("Coordinates") or ""
        if not wkt.strip().upper().startswith(("POLYGON", "MULTIPOLYGON")):
            fail("region %s came back without usable geometry (got %r). If this is the "
                 "geojson endpoint's empty-coordinates bug, check the f= parameter."
                 % (row.get("RegionID"), wkt[:60]))

    log("geometry %d region polygons, all non-empty" % len(rows))
    return rows


def run():
    survey = verify_survey()
    catalogue = verify_indicators()
    values = fetch_values()
    quintiles = fetch_quintiles()
    geometry = fetch_geometry()

    write_json(RAW / "dhs_survey.json", survey)
    write_json(RAW / "dhs_indicator_catalogue.json", catalogue)
    write_json(RAW / "dhs_values.json", values)
    write_json(RAW / "dhs_quintiles.json", quintiles)
    write_json(RAW / "dhs_geometry.json", geometry)


if __name__ == "__main__":
    main(run)

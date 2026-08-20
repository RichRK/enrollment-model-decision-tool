"""Join the fetched sources into data/regions.json.

Everything the site needs is precomputed here. The browser reads one file and
renders; it does no arithmetic beyond the live cost comparison, which is the one
thing that has to respond to user input.

Design decisions worth knowing before reading the code:

*   The unit of analysis is the 23 DHS geometry polygons. The /data endpoint also
    returns 6 former provinces and an Analamanga aggregate; those are dropped. The
    join is on RegionId and is exact -- there is no name matching in this file.

*   Missing means missing. A null from a source stays null all the way to the UI.
    Nothing is interpolated and no national figure is substituted for a regional one.

*   There is no connectivity layer. Ookla was removed in v2 -- see attic/README.md
    for why, at some length. Nothing here should reintroduce a demand-side measure
    of digital access.

*   The wealth-gradient work (v2 Part 2) is national-only until the household
    recode microdata is available. The aggregate API cannot cross region with
    wealth quintile; that was verified rather than assumed, and the evidence is in
    docs/02-crosstab.md. Regional quintile fields are emitted as explicitly pending
    rather than estimated.
"""

import datetime as dt
import warnings

import numpy as np
import rasterio
import rasterio.mask
import rasterio.windows
from shapely import wkt
from shapely.geometry import mapping

from config import (
    BOTTOM_GROUP,
    COORD_PRECISION,
    DHS_INDICATORS,
    DHS_QUINTILES,
    DHS_SURVEY_ID,
    DHS_SURVEY_YEAR,
    DISTORTION_ALARM,
    DISTORTION_WARN,
    HEADLINE_INDICATOR,
    MIN_CASES_FLAG,
    MIN_CASES_SUPPRESS,
    OUT,
    RAW,
    RECODE_INDICATORS,
    SIMPLIFY_TOLERANCE,
    TIPPING_BAND,
    TOP_GROUP,
    VERIFIED_ON,
    WORLDPOP_YEAR,
)
from common import fail, log, main, read_json, write_json
from gradient import gradient_metrics

# rasterio 1.5 reshapes arrays in a way NumPy 2.5 deprecates. It fires once per
# windowed read and drowns the build log. The scope is deliberately narrow so that
# any other deprecation still surfaces.
warnings.filterwarnings(
    "ignore",
    message="Setting the shape on a NumPy array has been deprecated",
    category=DeprecationWarning,
)


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------

def load_regions(value_rows):
    """23 leaf regions: geometry plus the display name from the values endpoint.

    Takes the already-parsed value rows rather than re-reading the file: this and
    load_dhs_values() both interpret the same 360 rows, and reading twice meant two
    independent decisions about what they contain.
    """
    geometry = read_json(RAW / "dhs_geometry.json")

    names = {}
    for row in value_rows:
        # Labels carry leading dots encoding hierarchy depth ("..Analamanga").
        names[row["RegionId"]] = row["CharacteristicLabel"].lstrip(". ").strip()

    regions = {}
    for feature in geometry:
        region_id = feature["RegionID"]
        if region_id not in names:
            fail("geometry region %s has no matching row in the values response" % region_id)
        geom = wkt.loads(feature["Coordinates"])
        if geom.is_empty:
            fail("geometry for %s parsed to an empty shape" % region_id)
        regions[region_id] = {
            "region_id": region_id,
            "name": names[region_id],
            "geometry": geom,
        }

    log("regions %d" % len(regions))
    return regions


def load_dhs_values(rows, regions):
    """Map indicator key -> region_id -> value, keeping only the 23 leaf regions."""
    by_id = {indicator: key for key, indicator in DHS_INDICATORS.items()}

    values = {key: {} for key in DHS_INDICATORS}
    denominators = {}
    for row in rows:
        key = by_id.get(row["IndicatorId"])
        if key is None or row["RegionId"] not in regions:
            continue
        value = row.get("Value")
        # A genuine null stays null. Do not coerce to zero.
        values[key][row["RegionId"]] = None if value is None else float(value)
        # The headline indicator's base is households, which is what makes this
        # denominator meaningful as `dhs_denominator_households` downstream.
        if key == HEADLINE_INDICATOR:
            denominators[row["RegionId"]] = row.get("DenominatorWeighted")

    for key, per_region in values.items():
        missing = [r for r in regions if per_region.get(r) is None]
        if len(missing) == len(regions):
            fail("indicator %s (%s) has no values for any leaf region"
                 % (key, DHS_INDICATORS[key]))
        if missing:
            log("note    %s missing for %d region(s): %s"
                % (key, len(missing), ", ".join(regions[r]["name"] for r in missing)))

    return values, denominators


# ---------------------------------------------------------------------------
# The wealth gradient -- national only, for now
# ---------------------------------------------------------------------------

def build_national_gradient():
    """Ownership by wealth quintile, nationally, with the targeting metrics.

    This is the v2 headline calculation. It runs at national level because that is
    the only level the aggregate API can serve it at. The arithmetic itself lives in
    gradient.py, shared with the per-region version in fetch_recode.py -- the two are
    the same calculation and differ only in how they shape the result and in what
    they do when it cannot be computed. Here, it cannot be computed means stop.
    """
    payload = read_json(RAW / "dhs_quintiles.json")
    rows = payload["indicators"]
    dropped = payload.get("dropped", {})

    out = {}
    for key, per_quintile in rows.items():
        ordered = [per_quintile.get(q) for q in DHS_QUINTILES]
        if any(cell is None for cell in ordered):
            fail("indicator %s is missing at least one national quintile" % key)

        m = gradient_metrics(ordered, DHS_QUINTILES, BOTTOM_GROUP, TOP_GROUP)
        if m is None:
            fail("indicator %s has an empty denominator" % key)

        out[key] = {
            "indicator_id": DHS_INDICATORS[key],
            "by_quintile": [
                {
                    "quintile": q,
                    "value": ordered[i]["value"],
                    "cases_unweighted": ordered[i]["denominator_unweighted"],
                    "denominator_weighted": ordered[i]["denominator_weighted"],
                    "pool_share": m["composition"][i],
                    "population_share": m["population_share"][i],
                }
                for i, q in enumerate(DHS_QUINTILES)
            ],
            "bottom_group_rate": m["bottom_rate"],
            "top_group_rate": m["top_rate"],
            "exclusion_gap": m["exclusion_gap"],
            "targeting_distortion": m["targeting_distortion"],
            "bottom_quintile_pool_share": m["composition"][0],
            "bottom_quintile_population_share": m["population_share"][0],
        }
        log("%-18s bottom %.1f%% top %.1f%% gap %+.1f distortion %.2f"
            % (key, m["bottom_rate"], m["top_rate"], m["exclusion_gap"],
               m["targeting_distortion"]))

    return {"indicators": out, "dropped": dropped}


def load_regional_gradient(regions):
    """Region x quintile aggregates from the recodes, if they have been computed.

    The aggregate API cannot produce these (docs/02-crosstab.md); they come from
    the household and individual recodes via fetch_recode.py. When that step has
    not run -- a clean checkout without the restricted microdata, which is the
    normal case for anyone else -- every region carries an explicit null and a
    reason. A national figure is never substituted for a regional one; doing so
    would reproduce precisely the error this tool exists to expose.

    Note that the values arriving here are already aggregates with suppression
    applied. No record-level data passes through this function.
    """
    path = RAW / "recode_quintiles.json"
    if not path.exists():
        log("note    no recode aggregates; regional quintile fields stay pending")
        # Every indicator the recode step would have produced, not just the headline
        # one. The two branches have to emit the same shape: if the pending branch
        # names fewer keys, a consumer asking for one of the others on a clean
        # checkout gets a bare null and loses the explanation for why.
        pending = {
            key: {
                "pending_reason": "requires the MD 2021 recode microdata; the "
                                  "aggregate API cannot cross region with wealth quintile",
            }
            for key in RECODE_INDICATORS
        }
        return {region_id: dict(pending) for region_id in regions}, False

    by_indicator = read_json(path)
    out = {region_id: {} for region_id in regions}
    for key, per_region in by_indicator.items():
        for region_id, summary in per_region.items():
            if region_id not in out:
                fail("recode aggregates reference region %s, which is not one of the "
                     "%d geometry regions" % (region_id, len(regions)))
            out[region_id][key] = summary

    usable = sum(1 for r in out.values()
                 if (r.get(HEADLINE_INDICATOR) or {}).get("targeting_distortion") is not None)
    log("regional gradient: %d of %d regions have a usable targeting_distortion"
        % (usable, len(regions)))
    return out, True


# ---------------------------------------------------------------------------
# WorldPop
# ---------------------------------------------------------------------------

def sum_polygon(src, geom):
    """Zonal sum over the WorldPop constrained raster, for one polygon.

    `src` is an open rasterio dataset. Takes the handle rather than owning it: the
    caller already has to scope the open file, and a class whose only state was that
    handle just meant the scoping happened twice.
    """
    try:
        arr, _ = rasterio.mask.mask(src, [mapping(geom)], crop=True, filled=True,
                                    nodata=0.0)
    except ValueError:
        return 0.0  # shape falls entirely outside the raster

    arr = arr.astype("float64")
    arr[~np.isfinite(arr)] = 0.0
    if src.nodata is not None:
        arr[arr == src.nodata] = 0.0
    # WorldPop encodes no-data as a large negative value in some releases.
    arr[arr < 0] = 0.0
    return float(arr.sum())


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def build_region_metrics(regions, dhs, denominators, raster_src, regional_quintiles):
    out = {}
    for region_id, region in regions.items():
        pop_total = sum_polygon(raster_src, region["geometry"])
        if pop_total <= 0:
            fail("WorldPop returned zero population for %s -- the raster and the geometry "
                 "are probably misaligned" % region["name"])

        record = {
            "region_id": region_id,
            "name": region["name"],
            "pop_total": round(pop_total),
            "dhs_denominator_households": denominators.get(region_id),
        }
        for key in DHS_INDICATORS:
            record[key] = dhs[key].get(region_id)
        record["quintiles"] = regional_quintiles[region_id]
        out[region_id] = record

    return out


def add_feasibility_bases(metrics):
    """The candidate readings of 'share who could complete a remote enrollment'.

    Each is a measured DHS value. None is a modelled index and none carries
    invented weights -- the user picks which constraint they think binds, and the
    map answers for that reading.

    A third basis, "woman owns a phone AND is literate", was offered and is gone.
    It could only ever be a range: the survey reports the two conditions
    separately and never crosses them, so the joint share lies somewhere between
    max(0, a + b - 1) and min(a, b), and both Frechet bounds had to be published
    rather than a point estimate. But the optimistic bound is min(phone,
    literacy), and women's literacy exceeds women's phone ownership in all 23
    regions -- so it was always just the phone figure, literacy never bound
    first, and the map never moved when it was selected. It contributed a wide
    interval around a number the phone basis already gave.
    """
    for m in metrics.values():
        m["feasibility_bases"] = {
            "hh_mobile_phone": m["hh_mobile_phone"],
            "phone_own_f": m["phone_own_f"],
        }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def round_coords(obj):
    """Recursively round a GeoJSON coordinate structure to COORD_PRECISION."""
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), COORD_PRECISION) for c in obj]
        return [round_coords(o) for o in obj]
    return obj


def simplify_geometry(geom):
    simplified = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
    if simplified.is_empty:
        fail("simplification emptied a region; lower SIMPLIFY_TOLERANCE")

    shape = mapping(simplified)
    return {"type": shape["type"], "coordinates": round_coords(shape["coordinates"])}


# Label and note for each DHS indicator, keyed exactly as DHS_INDICATORS is. Source
# and vintage are identical for all of them and are filled in by field_metadata()
# rather than repeated thirteen times. `SELF_REPORTED` is the default note; only the
# indicators that need something said about them override it.
SELF_REPORTED = "Self-reported."

DHS_FIELD_NOTES = {
    "hh_mobile_phone": ("Households possessing a mobile telephone",
                        "Self-reported. Household-level: it does not say whether the "
                        "person being enrolled can use the phone."),
    "hh_electricity": ("Households with electricity",
                       "A charging constraint on any phone-based process, and the "
                       "steepest wealth gradient of any indicator here."),
    "literacy_f": ("Women's literacy",
                   "Kept separate from the male figure throughout; never averaged."),
    "literacy_m": ("Men's literacy",
                   "Kept separate from the female figure throughout; never averaged."),
    "phone_own_f": ("Women who own a mobile phone", SELF_REPORTED),
    "phone_own_m": ("Men who own a mobile phone", SELF_REPORTED),
    "mobile_money_f": ("Women using a mobile phone for financial transactions",
                       SELF_REPORTED),
    "mobile_money_m": ("Men using a mobile phone for financial transactions",
                       SELF_REPORTED),
    "bank_account_f": ("Women with a bank account", SELF_REPORTED),
    "bank_account_m": ("Men with a bank account", SELF_REPORTED),
}


def field_metadata():
    """Source and vintage for every displayed field. The UI reads this, so no value
    can reach the screen without its provenance travelling alongside it."""
    missing = set(DHS_INDICATORS) ^ set(DHS_FIELD_NOTES)
    if missing:
        fail("DHS_FIELD_NOTES and DHS_INDICATORS disagree on: %s. Every indicator "
             "that reaches the screen needs a label and a note."
             % ", ".join(sorted(missing)))

    fields = {
        "pop_total": {
            "label": "Population",
            "source": "WorldPop constrained 100 m",
            "vintage": "%d (modelled)" % WORLDPOP_YEAR,
            "note": "Modelled projection, not a census count. Madagascar's last census was 2018.",
        },
    }
    fields.update({
        key: {
            "label": label,
            "source": "DHS Program API, %s" % DHS_SURVEY_ID,
            "vintage": str(DHS_SURVEY_YEAR),
            "note": note,
        }
        for key, (label, note) in DHS_FIELD_NOTES.items()
    })
    return fields


def run():
    value_rows = read_json(RAW / "dhs_values.json")
    regions = load_regions(value_rows)
    dhs, denominators = load_dhs_values(value_rows, regions)
    regional_quintiles, have_recode = load_regional_gradient(regions)

    # Everything that can fail cheaply runs before the raster does. The zonal pass
    # below is 23 masked reads over a 57 MB GeoTIFF; the three loads here are
    # milliseconds and can each stop the build, so doing them first means a missing
    # file or an incomplete quintile fails immediately rather than after the slow part.
    national_gradient = build_national_gradient()
    findex = read_json(RAW / "findex.json")
    survey = read_json(RAW / "dhs_survey.json")

    raster = RAW / ("worldpop_mdg_%d_constrained_100m.tif" % WORLDPOP_YEAR)
    if not raster.exists():
        fail("%s is missing -- run the WorldPop fetch step first" % raster.name)
    with rasterio.open(raster) as raster_src:
        metrics = build_region_metrics(
            regions, dhs, denominators, raster_src, regional_quintiles)

    add_feasibility_bases(metrics)

    features = []
    for region_id, region in regions.items():
        record = dict(metrics[region_id])
        record["geometry"] = simplify_geometry(region["geometry"])
        features.append(record)
    features.sort(key=lambda r: r["name"])

    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
        "verified_on": VERIFIED_ON,
        "country": "Madagascar",
        "schema_version": 2,
        "regions": features,
        "fields": field_metadata(),
        "national": {
            "population": sum(f["pop_total"] for f in features),
            "findex": findex,
            "wealth_gradient": national_gradient["indicators"],
            # Indicators withheld from the published gradient, with the reason.
            # Recorded rather than silently absent: a reader should be able to see
            # that women's internet use was asked about and why its numbers are not
            # on the page.
            "wealth_gradient_withheld": national_gradient["dropped"],
        },
        # Every judgement call the browser needs travels here rather than being
        # restated as a literal in app.js. The thresholds below used to be mirrored
        # by hand on the JS side, with a comment saying so -- a comment that only
        # existed because the mechanism to ship them did.
        "constants": {
            "quintiles": DHS_QUINTILES,
            "bottom_group": BOTTOM_GROUP,
            "top_group": TOP_GROUP,
            "headline_indicator": HEADLINE_INDICATOR,
            "min_cases_flag": MIN_CASES_FLAG,
            "min_cases_suppress": MIN_CASES_SUPPRESS,
            "simplify_tolerance_deg": SIMPLIFY_TOLERANCE,
            "distortion_alarm": DISTORTION_ALARM,
            "distortion_warn": DISTORTION_WARN,
            "tipping_band": TIPPING_BAND,
        },
        "pending": {} if have_recode else {
            "regional_wealth_gradient": {
                "blocked_on": "DHS microdata: Madagascar 2021 household recode",
                "why": "The aggregate API returns the union of its breakdowns, not their "
                       "cross product, so region x wealth quintile is not retrievable "
                       "from it. Verified 2026-08-05; see docs/02-crosstab.md.",
                "unblocks": ["ownership_by_quintile", "reachable_pool_composition",
                             "exclusion_gap", "targeting_distortion"],
            },
        },
        "sources": {
            "dhs": {
                "survey_id": DHS_SURVEY_ID,
                "survey_year": DHS_SURVEY_YEAR,
                "survey_type": survey.get("SurveyType"),
                "indicators": DHS_INDICATORS,
                "endpoint": "https://api.dhsprogram.com/rest/dhs/",
            },
            "worldpop": {"year": WORLDPOP_YEAR, "resolution": "100 m", "type": "constrained"},
        },
    }

    write_json(OUT / "regions.json", payload)
    size = (OUT / "regions.json").stat().st_size
    log("regions.json is %.2f MB" % (size / 1e6))
    if size > 5_000_000:
        fail("regions.json is over the 5 MB committed-data budget")


if __name__ == "__main__":
    main(run)

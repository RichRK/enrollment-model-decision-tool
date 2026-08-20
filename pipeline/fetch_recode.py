"""Compute region x wealth-quintile aggregates from the DHS household and
individual recodes.

RESTRICTED INPUT. Read CLAUDE.md before changing anything here.

What this module may and may not emit is not a style question:

*   It reads the recodes, which are record-level data under a signed agreement.
*   It writes ONLY aggregates -- a rate, a weighted denominator and an unweighted
    case count per (region, quintile) cell. No row of the recode, no identifier,
    nothing at cluster or enumeration-area level, ever leaves this function.
*   Cells below the suppression floor are emitted with a null value and a flag.
    The floor is not configurable and must not become configurable.

The output is written to data/raw/, which is gitignored. That is belt and braces:
the file contains only publishable aggregates, but keeping every recode-derived
artefact behind the same ignore rule means there is one rule to get right rather
than two.

Correctness is not assumed. Every figure computed here that the public aggregate
API also publishes is checked against it, and the build stops on disagreement.
That check is what proves the variable choices, the weight scaling and the
literacy definition -- getting any of them wrong would produce plausible regional
numbers that are quietly false, which is the failure mode this project keeps
running into.
"""

import numpy as np
import pandas as pd

from config import (
    BOTTOM_GROUP,
    DHS_QUINTILES,
    MIN_CASES_FLAG,
    MIN_CASES_SUPPRESS,
    RAW,
    RECODE_HOUSEHOLD,
    RECODE_INDICATORS,
    RECODE_INDIVIDUAL,
    RECODE_LITERACY,
    RECODE_REGION_TO_DHS,
    RECODE_TOLERANCE_PP,
    RECODE_VARS,
    RECODE_WEIGHT_SCALE,
    TOP_GROUP,
)
from common import fail, log, main, read_json, write_json
from gradient import gradient_metrics

QUINTILE_CODES = {1: "Lowest", 2: "Second", 3: "Middle", 4: "Fourth", 5: "Highest"}


def recodes_present():
    return RECODE_HOUSEHOLD.exists() and RECODE_INDIVIDUAL.exists()


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def indicator_columns(kind):
    """The recode variables this file has to supply, read out of RECODE_INDICATORS
    rather than hand-listed. Adding a fifth indicator to config.py is then one edit,
    not two -- and forgetting the second used to surface as a bare KeyError deep in
    run() rather than as anything a reader could connect to the config."""
    return [spec["var"] for spec in RECODE_INDICATORS.values()
            if spec["file"] == kind and spec["var"]]


def load_recode(kind, path, extra_columns=()):
    """Read one recode, keeping only the columns needed.

    The individual recode has 4,688 variables and is 96 MB; loading it whole would be
    wasteful and would put far more record data in memory than this needs.
    """
    v = RECODE_VARS[kind]
    columns = [v["region"], v["wealth"], v["weight"]]
    columns += indicator_columns(kind) + list(extra_columns)

    frame = pd.read_stata(path, columns=columns, convert_categoricals=False)
    frame = frame.rename(columns={v["region"]: "region_code", v["wealth"]: "wealth",
                                  v["weight"]: "weight"})
    frame["weight"] = frame["weight"] / RECODE_WEIGHT_SCALE
    log("%s recode: %d records" % (kind, len(frame)))
    return frame


def load_individual():
    """The individual recode, plus the derived literacy column.

    Literacy is the reading-card result alone -- see the long note on RECODE_LITERACY
    in config.py for why the education clause is not here. Women who cannot read, and
    women recorded as visually impaired, are not literate but remain in the
    denominator.
    """
    frame = load_recode("individual", RECODE_INDIVIDUAL,
                        extra_columns=[RECODE_LITERACY["reading"]])
    reading = frame[RECODE_LITERACY["reading"]]
    frame["literacy_f"] = reading.isin(RECODE_LITERACY["reading_literate"]).astype("float64")
    frame.loc[reading.isna(), "literacy_f"] = np.nan
    return frame


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def binary(series):
    """DHS yes/no variables are 1 = yes, 0 = no; anything else is not an answer."""
    out = pd.Series(np.nan, index=series.index, dtype="float64")
    out[series == 1] = 1.0
    out[series == 0] = 0.0
    return out


def cells(frame, indicator_column, by_region):
    """Weighted rate plus an unweighted case count, per cell.

    Returns {key: {"value", "denominator_weighted", "cases_unweighted"}} where key
    is (region_id, quintile) or just quintile.
    """
    answered = frame[indicator_column].notna()
    work = frame.loc[answered].copy()
    work["_num"] = work[indicator_column] * work["weight"]

    group_cols = ["wealth"]
    if by_region:
        group_cols = ["region_id", "wealth"]

    grouped = work.groupby(group_cols, observed=True, dropna=True)
    agg = grouped.agg(
        numerator=("_num", "sum"),
        denominator=("weight", "sum"),
        cases=(indicator_column, "size"),
    )

    out = {}
    for key, row in agg.iterrows():
        quintile = QUINTILE_CODES.get(int(key[-1]) if by_region else int(key))
        if quintile is None:
            continue
        ident = (key[0], quintile) if by_region else quintile
        denominator = float(row["denominator"])
        out[ident] = {
            "value": (float(row["numerator"]) / denominator * 100.0) if denominator else None,
            "denominator_weighted": denominator,
            "cases_unweighted": int(row["cases"]),
        }
    return out


def map_regions(frame):
    codes = frame["region_code"].astype("Int64")
    unknown = sorted(set(codes.dropna().unique()) - set(RECODE_REGION_TO_DHS))
    if unknown:
        fail("recode region codes with no mapping to a DHS RegionId: %s. Update "
             "RECODE_REGION_TO_DHS in config.py -- do not drop them." % unknown)
    frame = frame.copy()
    frame["region_id"] = codes.map(RECODE_REGION_TO_DHS)
    if frame["region_id"].isna().any():
        fail("some records could not be assigned a RegionId")
    return frame


# ---------------------------------------------------------------------------
# Validation against the public aggregate API
# ---------------------------------------------------------------------------

def api_regional_values():
    rows = read_json(RAW / "dhs_values.json")
    out = {}
    for row in rows:
        out.setdefault(row["IndicatorId"], {})[row["RegionId"]] = row.get("Value")
    return out


def validate(key, national_cells, regional_cells, api_quintiles, api_regions):
    """Stop the build unless the microdata reproduces what DHS already published.

    This is the whole basis for trusting the regional figures, which nothing else
    can check.
    """
    spec = RECODE_INDICATORS[key]
    problems = []

    # 1. National rate per quintile.
    published = api_quintiles.get(key)
    if published:
        for quintile in DHS_QUINTILES:
            mine = national_cells.get(quintile)
            theirs = published.get(quintile)
            if mine is None or theirs is None:
                problems.append("%s/%s: missing on one side" % (key, quintile))
                continue
            delta = abs(mine["value"] - theirs["value"])
            if delta > RECODE_TOLERANCE_PP:
                problems.append("%s/%s: computed %.2f vs published %.2f (%.2f pp apart)"
                                % (key, quintile, mine["value"], theirs["value"], delta))
            # 2. Unweighted case counts must match exactly -- they are counts, not
            #    estimates, so any difference means a different denominator.
            if mine["cases_unweighted"] != theirs["denominator_unweighted"]:
                problems.append("%s/%s: %d unweighted cases vs published %s"
                                % (key, quintile, mine["cases_unweighted"],
                                   theirs["denominator_unweighted"]))

    # 3. Regional rate. This is what proves RECODE_REGION_TO_DHS: a mis-mapping
    #    would leave the national totals intact while scrambling the regions.
    published_regions = api_regions.get(spec["api"], {})
    checked = 0
    for region_id, expected in published_regions.items():
        if region_id not in RECODE_REGION_TO_DHS.values() or expected is None:
            continue
        region_cells = [c for (r, _q), c in regional_cells.items() if r == region_id]
        if not region_cells:
            problems.append("%s: no microdata cells for region %s" % (key, region_id))
            continue
        numerator = sum(c["value"] / 100.0 * c["denominator_weighted"] for c in region_cells)
        denominator = sum(c["denominator_weighted"] for c in region_cells)
        mine = numerator / denominator * 100.0 if denominator else None
        if mine is None:
            problems.append("%s: empty denominator for region %s" % (key, region_id))
            continue
        delta = abs(mine - float(expected))
        if delta > RECODE_TOLERANCE_PP:
            problems.append("%s/%s: computed %.2f vs published %.2f (%.2f pp apart)"
                            % (key, region_id, mine, float(expected), delta))
        checked += 1

    if problems:
        fail("the microdata does not reproduce what DHS published, so the regional "
             "figures cannot be trusted either. Check the variable names, the weight "
             "scaling and the indicator definition before going further.\n  - "
             + "\n  - ".join(problems[:12]))

    log("%-16s reproduces API: 5 national quintiles, %d regions" % (key, checked))


# ---------------------------------------------------------------------------
# Suppression
# ---------------------------------------------------------------------------

def apply_suppression(cell):
    """DHS's own conventions: flag 25-49 unweighted cases, suppress below 25.

    Mandatory, not configurable. A suppressed cell keeps its case count -- that is
    what shows the reader why the value is absent -- and loses its value entirely.
    """
    n = cell["cases_unweighted"]
    suppressed = n < MIN_CASES_SUPPRESS
    return {
        "value": None if suppressed else cell["value"],
        "cases_unweighted": n,
        "denominator_weighted": None if suppressed else cell["denominator_weighted"],
        "suppressed": suppressed,
        "flagged": (not suppressed) and n < MIN_CASES_FLAG,
    }


def absent_cell(quintile):
    """A quintile the survey sampled nobody in, as a cell rather than a gap.

    NOT the same thing as a suppressed cell, and the two must never render alike.
    Suppressed means "households were sampled here, too few to publish a rate".
    Absent means the survey holds none at all: wealth quintiles are national, so
    Antananarivo capital -- the wealthiest place in the country -- contains no
    bottom-quintile households whatsoever. Conflating the two would tell a reader
    that the poorest fifth of the capital is unmeasured, when the truth is that
    by this survey's own definition there isn't one.

    The count is a real zero, not a missing count, which is why it is safe to
    publish: nothing is suppressed here because there was nothing to suppress.
    """
    return {"quintile": quintile, "value": None, "cases_unweighted": 0,
            "denominator_weighted": None, "suppressed": False, "flagged": False,
            "absent": True}


def region_summary(region_id, per_quintile):
    """Composition and distortion for one region, or nulls with a reason."""
    ordered = [per_quintile.get(q) for q in DHS_QUINTILES]

    absent = [DHS_QUINTILES[i] for i, c in enumerate(ordered) if c is None]
    suppressed = [DHS_QUINTILES[i] for i, c in enumerate(ordered)
                  if c is not None and c["suppressed"]]
    flagged = [DHS_QUINTILES[i] for i, c in enumerate(ordered)
               if c is not None and c["flagged"]]

    # The cells that DO exist are real published figures and the card shows them,
    # even when one of the five is missing entirely. Withholding the whole
    # breakdown because one quintile is empty threw away four good measurements
    # and left the reader with nothing at all for the one region where the
    # national-quintile effect is starkest.
    result = {
        "ownership_by_quintile": [
            absent_cell(DHS_QUINTILES[i]) if ordered[i] is None
            else dict(quintile=DHS_QUINTILES[i], **ordered[i])
            for i in range(5)
        ],
        "absent_quintiles": absent,
        "suppressed_quintiles": suppressed,
        "flagged_quintiles": flagged,
    }

    if absent or suppressed:
        # The reachable pool is a sum across all five cells. With one missing, the
        # denominator is understated and every share built on it is wrong in a
        # direction that flatters the result. Do not publish a distortion here.
        # An absent quintile withholds it for exactly the same reason a suppressed
        # one does -- the sum is short a term either way.
        reasons = []
        if absent:
            reasons.append("quintile(s) with no households sampled at all: %s"
                           % ", ".join(absent))
        if suppressed:
            reasons.append("quintile cell(s) below %d unweighted cases: %s"
                           % (MIN_CASES_SUPPRESS, ", ".join(suppressed)))
        result.update({
            "reachable_pool_composition": None,
            "exclusion_gap": None,
            "targeting_distortion": None,
            "targeting_distortion_bottom2": None,
            "pending_reason": "; ".join(reasons),
        })
        return result

    # The same arithmetic as the national gradient in build.py, from the one place
    # it is defined. Here, "cannot be computed" is recorded as a pending_reason
    # rather than stopping the build: one region with nobody reachable is a finding,
    # not a broken input.
    m = gradient_metrics(ordered, DHS_QUINTILES, BOTTOM_GROUP, TOP_GROUP)
    if m is None:
        result.update({"reachable_pool_composition": None, "exclusion_gap": None,
                       "targeting_distortion": None, "targeting_distortion_bottom2": None,
                       "pending_reason": "nobody in this region is reachable by this channel"})
        return result

    result.update({
        "reachable_pool_composition": [
            {"quintile": DHS_QUINTILES[i], "pool_share": m["composition"][i],
             "population_share": m["population_share"][i]} for i in range(5)
        ],
        "bottom_group_rate": m["bottom_rate"],
        "top_group_rate": m["top_rate"],
        "exclusion_gap": m["exclusion_gap"],
        # The bottom-quintile figure is the headline the spec asks for. The
        # bottom-two figure rests on roughly twice the sample and is the one to
        # quote where a single cell is thin, so both are emitted.
        "targeting_distortion": m["targeting_distortion"],
        "targeting_distortion_bottom2": m["targeting_distortion_bottom_group"],
        "pending_reason": None,
    })
    return result


# ---------------------------------------------------------------------------

def run():
    if not recodes_present():
        log("recodes not present in data/raw/ -- skipping.")
        log("  expected %s" % RECODE_HOUSEHOLD.relative_to(RAW.parent.parent))
        log("  expected %s" % RECODE_INDIVIDUAL.relative_to(RAW.parent.parent))
        log("  the build will emit regional quintile fields as pending.")
        return

    frames = {"household": map_regions(load_recode("household", RECODE_HOUSEHOLD)),
              "individual": map_regions(load_individual())}

    api_quintiles = read_json(RAW / "dhs_quintiles.json")["indicators"]
    api_regions = api_regional_values()

    output = {}
    for key, spec in RECODE_INDICATORS.items():
        frame = frames[spec["file"]]
        # An indicator either names a raw recode variable, which needs the DHS
        # yes/no coding collapsing to 0/1/NaN, or it is derived upstream into a
        # column named for the key itself (literacy_f, in load_individual).
        column = spec["var"] or key
        work = frame.copy()
        if spec["var"]:
            work[column] = binary(work[column])

        national = cells(work, column, by_region=False)
        regional = cells(work, column, by_region=True)
        validate(key, national, regional, api_quintiles, api_regions)

        by_region = {}
        for (region_id, quintile), cell in regional.items():
            by_region.setdefault(region_id, {})[quintile] = apply_suppression(cell)

        output[key] = {
            region_id: region_summary(region_id, per_quintile)
            for region_id, per_quintile in by_region.items()
        }

    # A last look before anything is written: no cell below the floor may carry a
    # value, and every cell must carry a count.
    for key, regions in output.items():
        for region_id, summary in regions.items():
            for cell in (summary.get("ownership_by_quintile") or []):
                if cell["cases_unweighted"] is None:
                    fail("%s/%s/%s has no unweighted case count"
                         % (key, region_id, cell["quintile"]))
                if cell["cases_unweighted"] < MIN_CASES_SUPPRESS and cell["value"] is not None:
                    fail("%s/%s/%s has %d cases but still carries a value -- the "
                         "suppression rule did not apply"
                         % (key, region_id, cell["quintile"], cell["cases_unweighted"]))

    write_json(RAW / "recode_quintiles.json", output)

    total = sum(len(r) for r in output.values())
    suppressed = sum(1 for regions in output.values() for s in regions.values()
                     if s.get("suppressed_quintiles"))
    log("%d indicator-regions written, %d with at least one suppressed quintile"
        % (total, suppressed))


if __name__ == "__main__":
    main(run)

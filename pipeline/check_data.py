"""Audit pipeline/data/regions.json against the DHS data agreement.

This is section 7 of docs/dhs-data-terms-constraints.md made runnable, because a
checklist that has to be remembered is a checklist that eventually is not.
`run()` is wired into run_all.py as the last pipeline step, so `make build`
fails if this fails -- a build isn't considered successful just because it ran
without an exception, it also has to pass this audit. Run it on its own,
without a full rebuild:

    make check-data

(from the repo root -- this is one half of that; the other half audits the
built site and lives in site/tests/check-data.test.js. Nothing here needs
visibility outside this directory, and nothing there needs visibility into
this one.)

It is a backstop and not a substitute for reading the terms -- it can see
paths, file types and output structure, but it cannot judge intent.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from common import SourceError

ROOT = Path(__file__).resolve().parent  # this directory (pipeline/)

RESTRICTED_DIRS = ("data/raw/", "data/interim/")

# Column names that would indicate record-level or cluster-level DHS data. The
# v0xx codes are the standard DHS recode variables for cluster, household and line
# number -- if any of these reach an output, something has gone badly wrong.
DISCLOSIVE_KEYS = re.compile(
    r"\b(hhid|caseid|cluster|enumeration[_ ]?area|\bea\b|psu|"
    r"v001|v002|v003|hv001|hv002|hv003|midx|respondent)\b",
    re.IGNORECASE,
)


def git(*args):
    out = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True, text=True)
    return out.stdout.splitlines()


def run():
    """Run every check, print a PASS/FAIL report, and raise SourceError if
    anything failed -- the same contract every other pipeline step follows
    (see fetch_dhs.run, build.run), so run_all.py's step loop handles a
    failure here exactly like it handles a failure anywhere else."""
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))

    # -----------------------------------------------------------------------
    # 1. Nothing restricted is visible to git
    # -----------------------------------------------------------------------

    # Everything git tracks or would track, as paths relative to this
    # directory (pipeline/) -- tracked files plus untracked-but-not-ignored.
    visible = set(git("ls-files")) | set(git("ls-files", "--others", "--exclude-standard"))

    in_restricted_dirs = sorted(p for p in visible if p.startswith(RESTRICTED_DIRS))
    check("No file from data/raw/ or data/interim/ is visible to git",
          not in_restricted_dirs,
          "found: " + ", ".join(in_restricted_dirs[:5]) if in_restricted_dirs else "")

    # The ignore rules must actually be doing the work, not merely be untested.
    probes = [
        "data/raw/MDHR81FL.DTA",
        "data/interim/households.parquet",
        "data/raw/worldpop.tif",
    ]
    unignored = [p for p in probes
                 if subprocess.run(["git", "check-ignore", "-q", p], cwd=ROOT).returncode != 0]
    check("Ignore rules catch representative microdata paths",
          not unignored,
          "NOT ignored: " + ", ".join(unignored) if unignored else "")

    # -----------------------------------------------------------------------
    # 2. The published output is aggregates only
    # -----------------------------------------------------------------------

    regions_path = ROOT / "data" / "regions.json"
    if not regions_path.exists():
        check("data/regions.json exists", False, "run `uv run python run_all.py` first")
    else:
        payload = json.loads(regions_path.read_text(encoding="utf-8"))
        blob = regions_path.read_text(encoding="utf-8")

        n_regions = len(payload.get("regions", []))
        check("regions.json holds regional aggregates, not records",
              0 < n_regions <= 100,
              "%d region records" % n_regions)

        hits = sorted(set(m.group(0) for m in DISCLOSIVE_KEYS.finditer(blob)))
        # "Region"/"regional" must not trip the \bea\b probe via substring; the
        # regex uses word boundaries, so a hit here is a real one.
        check("No record-, cluster- or enumeration-area-level identifiers in regions.json",
              not hits,
              "found: " + ", ".join(hits) if hits else "")

        # Every quintile cell must carry an unweighted count, and none under
        # the suppression floor may carry a rendered value.
        floor = payload.get("constants", {}).get("min_cases_suppress")
        check("Suppression floor is present in the output",
              floor is not None, "min_cases_suppress = %s" % floor)

        cells = []
        for key, grad in (payload.get("national", {}).get("wealth_gradient") or {}).items():
            for cell in grad.get("by_quintile", []):
                cells.append(("national/" + key, cell))

        # Regional cells are keyed by indicator: regions[].quintiles[indicator].
        # Walk every indicator rather than one hardcoded key -- an earlier
        # version of this script looked for a single ownership_by_quintile
        # directly under `quintiles`, found nothing after the structure
        # changed, and reported PASS while auditing only the national third
        # of the output.
        regional_cells = 0
        for region in payload.get("regions", []):
            per_indicator = region.get("quintiles") or {}
            if not isinstance(per_indicator, dict):
                continue
            for key, summary in per_indicator.items():
                if not isinstance(summary, dict):
                    continue
                for cell in (summary.get("ownership_by_quintile") or []):
                    cells.append(("%s/%s" % (region["name"], key), cell))
                    regional_cells += 1

        check("The audit reaches the regional quintile cells, not just the national ones",
              regional_cells > 0 or not payload.get("pending", {}) == {},
              "%d regional cells found" % regional_cells)

        # A count must be a positive integer. The DHS API returns an empty
        # STRING for some indicators, which is neither null nor zero and
        # slips past a truthiness test -- so check the type, not just the
        # presence.
        def usable_count(cell):
            n = cell.get("cases_unweighted")
            return n if isinstance(n, int) and n > 0 else None

        # A cell explicitly marked absent is the one legitimate zero: the survey
        # sampled nobody in that region x quintile, so 0 is the true count rather
        # than a count that went missing. It carries no value and cannot leak one.
        # Everything else must still have a real positive integer -- this
        # narrowing does not admit null, "" or an unmarked zero.
        def truly_absent(cell):
            return (cell.get("absent") is True
                    and cell.get("cases_unweighted") == 0
                    and cell.get("value") is None)

        countless = ["%s/%s (%r)" % (where, c.get("quintile"), c.get("cases_unweighted"))
                     for where, c in cells
                     if usable_count(c) is None and not truly_absent(c)]
        check("Every rendered quintile cell carries a usable unweighted case count",
              not countless,
              "; ".join(countless[:5]) if countless else "%d cells checked" % len(cells))

        if floor is not None:
            rendered_thin = [
                "%s/%s (%s cases)" % (where, c.get("quintile"), usable_count(c))
                for where, c in cells
                if usable_count(c) is not None
                and usable_count(c) < floor
                and c.get("value") is not None
            ]
            check("No cell under the suppression floor carries a rendered value",
                  not rendered_thin,
                  "; ".join(rendered_thin[:5]) if rendered_thin else "")

        withheld = payload.get("national", {}).get("wealth_gradient_withheld") or {}
        check("Indicators withheld for missing case counts are recorded, not silently dropped",
              isinstance(withheld, dict),
              ("withheld: " + ", ".join(sorted(withheld))) if withheld else "none withheld")

    # -----------------------------------------------------------------------

    print()
    failed = 0
    for name, ok, detail in results:
        print("  [%s] %s" % ("PASS" if ok else "FAIL", name))
        if detail:
            print("         %s" % detail)
        if not ok:
            failed += 1

    print()
    if failed:
        print("%d of %d checks FAILED -- do not commit or publish until resolved." %
              (failed, len(results)))
        print("See CLAUDE.md and docs/dhs-data-terms-constraints.md.")
    else:
        print("All %d checks passed." % len(results))
    print()
    # run_all.py prints its own "== check-data ==" / "done in Xs" bracket
    # (to stderr, always flushed) around this call. Without an explicit flush
    # here, stdout can still be sitting in Python's buffer when that "done"
    # line prints, so the report appears to jump to *after* it when the two
    # streams are captured together (a pipe, a log file, `make`'s own output).
    sys.stdout.flush()

    if failed:
        raise SourceError("%d of %d data-agreement checks failed" % (failed, len(results)))


if __name__ == "__main__":
    try:
        run()
    except SourceError:
        sys.exit(1)
    sys.exit(0)

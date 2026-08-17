"""Run the whole pipeline: fetch every source, build data/regions.json, then
audit it against the DHS data agreement (check_data.run) -- a build that
raises no exception but fails the audit still fails.

This is what `make build` invokes, so the Make path and the plain-Python path are
the same code rather than two orderings that can drift apart. It also means the
pipeline runs on a machine without Make, which on Windows is most of them.

Run from inside pipeline/ (that's where pyproject.toml/uv.lock live):

    uv run python run_all.py              fetch (using the cache) and build
    uv run python run_all.py --clean      discard data/raw first, forcing a cold run
    uv run python run_all.py --fetch      fetch only
    uv run python run_all.py --clean-only discard and stop (what `make clean` runs)

`clean()` below is the only implementation of "what may be deleted from data/raw",
which is why `make clean` calls this script instead of repeating the rule in a
shell recipe: the DHS recode directories cannot be refetched, so a second copy of
that rule is a second chance to get it wrong.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import OUT, RAW              # noqa: E402
from common import SourceError, log      # noqa: E402

import build as build_step               # noqa: E402
import check_data                        # noqa: E402
import fetch_dhs                         # noqa: E402
import fetch_findex                      # noqa: E402
import fetch_recode                      # noqa: E402
import fetch_worldpop                    # noqa: E402

# There is deliberately no Ookla step. It was removed in v2; attic/README.md says
# why at length, and the short version is that a crowdsourced demand-side measure of
# digital activity is biased along the same axis as the exclusion this tool exists
# to detect.
STEPS = [
    ("fetch: DHS", fetch_dhs.run),
    ("fetch: WorldPop", fetch_worldpop.run),
    ("fetch: Findex", fetch_findex.run),
    # Reads the restricted recodes if they are present in data/raw/, and writes
    # only suppressed aggregates. Skips cleanly when they are not, so a clean
    # checkout without the microdata still builds.
    ("aggregate: DHS recodes", fetch_recode.run),
]


def clean():
    """Remove what a fetch step can put back, and nothing else.

    Deliberately NOT `rmtree(RAW)`. The DHS recodes live there, they cannot be
    refetched by this pipeline, and re-obtaining them means going back to DHS for
    another approval.

    This is the only implementation of that rule -- `make clean` calls this script
    rather than repeating the policy in a shell recipe, because a safety rule with
    two implementations is a safety rule with one of them out of date.
    """
    removed = 0
    if RAW.exists():
        for path in RAW.iterdir():
            if path.is_dir():
                continue  # recode directories -- never touched
            path.unlink()
            removed += 1
    (OUT / "regions.json").unlink(missing_ok=True)
    print("removed %d refetchable file(s) from data/raw; recode directories kept"
          % removed, file=sys.stderr)


def run(steps):
    for name, func in steps:
        print("== %s ==" % name, file=sys.stderr, flush=True)
        started = time.time()
        try:
            func()
        except SourceError as exc:
            print("\nFAILED at '%s': %s\n" % (name, exc), file=sys.stderr)
            return 1
        log("done in %.1fs" % (time.time() - started))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean", action="store_true",
                        help="delete data/raw and data/regions.json first")
    parser.add_argument("--fetch", action="store_true", help="fetch only, do not build")
    parser.add_argument("--clean-only", action="store_true",
                        help="delete and stop; do not fetch or build (what `make clean` runs)")
    args = parser.parse_args()

    if args.clean or args.clean_only:
        clean()
    if args.clean_only:
        return 0

    # A build isn't successful just because it ran without an exception -- it also
    # has to pass the data-agreement audit. --fetch never produces a regions.json,
    # so there is nothing for that step to check yet.
    if args.fetch:
        return run(STEPS)
    return run(STEPS + [("build", build_step.run), ("check-data", check_data.run)])


if __name__ == "__main__":
    sys.exit(main())

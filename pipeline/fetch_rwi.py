"""Download Meta's Relative Wealth Index for Madagascar from HDX.

One row per ~2.4 km square: its centre's latitude and longitude, the index, and
the model's error. Public data (CC BY-NC 4.0), so it sits in data/raw/ only
because every download does.
"""

import csv

from config import RAW, RWI_EXPECTED_ROWS, RWI_URL
from common import download, fail, log, main

RWI_FILE = RAW / "mdg_relative_wealth_index.csv"


def read_rows():
    """The squares as (lat, lon, rwi, error) floats, after checking the file is whole."""
    with open(RWI_FILE, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["latitude", "longitude", "rwi", "error"]:
            fail("unexpected RWI columns: %s" % reader.fieldnames)
        rows = [(float(r["latitude"]), float(r["longitude"]), float(r["rwi"]), float(r["error"]))
                for r in reader]
    if len(rows) != RWI_EXPECTED_ROWS:
        fail("RWI has %d rows, expected %d" % (len(rows), RWI_EXPECTED_ROWS))
    lats, lons = [r[0] for r in rows], [r[1] for r in rows]
    if not (-26 < min(lats) and max(lats) < -11 and 43 < min(lons) and max(lons) < 51):
        fail("RWI points do not look like Madagascar: lat %.2f..%.2f lon %.2f..%.2f"
             % (min(lats), max(lats), min(lons), max(lons)))
    return rows


def run():
    download(RWI_URL, RWI_FILE)
    rows = read_rows()
    log("rwi     %d squares, index %.3f..%.3f"
        % (len(rows), min(r[2] for r in rows), max(r[2] for r in rows)))


if __name__ == "__main__":
    main(run)

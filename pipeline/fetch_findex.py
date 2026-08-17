"""Fetch the national Findex reference line from the World Bank Indicators API.

One indicator, one country. Findex is a periodic survey, so most years are null;
those stay null all the way to the UI rather than being interpolated into a line.
"""

from config import FINDEX_INDICATORS, RAW, WORLDBANK_URL
from common import fail, get_json, log, main, write_json


def run():
    out = {}
    for key, indicator in FINDEX_INDICATORS.items():
        payload = get_json(WORLDBANK_URL.format(indicator=indicator))
        if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
            fail("World Bank API returned no series for %s (%s)" % (key, indicator))

        rows = payload[1]
        name = rows[0]["indicator"]["value"]
        observations = sorted(
            ((row["date"], row["value"]) for row in rows if row["value"] is not None),
            reverse=True,
        )
        if not observations:
            fail("%s (%s) exists but has no non-null Madagascar values" % (key, indicator))

        out[key] = {
            "indicator_id": indicator,
            "indicator_name": name,
            "source": "Global Findex, via World Bank Indicators API",
            "observations": [{"year": int(year), "value": value} for year, value in observations],
            "latest_year": int(observations[0][0]),
            "latest_value": observations[0][1],
        }
        log("%-20s %d observations, latest %s = %.1f"
            % (indicator, len(observations), observations[0][0], observations[0][1]))

    write_json(RAW / "findex.json", out)


if __name__ == "__main__":
    main(run)

"""Join Meta's wealth squares, WorldPop and the regions into data/squares.json.

Each square gets a DHS region, a WorldPop population and a national wealth fifth
(poorest first, by population). No DHS indicator values are written here: the
site joins each square to its region-by-fifth rates from regions.json. The only
DHS-derived numbers are the wealth-fifth population shares in `wealth_check`,
which regions.json already publishes as weighted denominators.
"""

import json
import math

import numpy as np
import rasterio
from shapely import STRtree, points
from shapely.geometry import shape

from config import (DHS_QUINTILES, OUT, RAW, RWI_COASTAL_SNAP_DEG, RWI_TILE_ZOOM,
                    WORLDPOP_YEAR)
from common import fail, log, main, read_json
import fetch_rwi

SCHEMA_VERSION = 1
FIELDS = ["tile_x", "tile_y", "rwi", "error", "region", "pop", "fifth"]


def tile_xy(lon, lat):
    """Web Mercator tile indices at RWI_TILE_ZOOM, the grid Meta's squares sit on."""
    n = 2 ** RWI_TILE_ZOOM
    lr = np.radians(lat)
    x = np.floor((lon + 180) / 360 * n).astype(int)
    y = np.floor((1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n).astype(int)
    return x, y


def assign_regions(lon, lat, geoms):
    """Index of the region containing each point, the nearest within the coastal snap, or -1."""
    pts = points(lon, lat)
    tree = STRtree(geoms)
    reg = np.full(len(pts), -1)
    pi, gi = tree.query(pts, predicate="within")
    reg[pi] = gi
    outside = np.where(reg < 0)[0]
    if len(outside):
        idx, dist = tree.query_nearest(pts[outside], return_distance=True, all_matches=False)
        near = dist < RWI_COASTAL_SNAP_DEG
        reg[outside[idx[0][near]]] = idx[1][near]
        log("coast   %d squares outside every region, %d snapped to the nearest"
            % (len(outside), int(near.sum())))
    return reg


def population(tx, ty):
    """WorldPop people per square (summed by 100 m pixel centre), and the national total."""
    raster = RAW / ("worldpop_mdg_%d_constrained_100m.tif" % WORLDPOP_YEAR)
    if not raster.exists():
        fail("%s is missing -- run the fetch step first" % raster)
    n = 2 ** RWI_TILE_ZOOM
    x0, x1, y0, y1 = tx.min(), tx.max() + 1, ty.min(), ty.max() + 1
    grid = np.zeros((y1 - y0, x1 - x0))
    total = 0.0
    with rasterio.open(raster) as src:
        tr = src.transform
        lons = tr.c + (np.arange(src.width) + 0.5) * tr.a
        cx = np.floor((lons + 180) / 360 * n).astype(int) - x0
        inside = (cx >= 0) & (cx < x1 - x0)
        for r0 in range(0, src.height, 512):
            h = min(512, src.height - r0)
            a = src.read(1, window=((r0, r0 + h), (0, src.width))).astype("float64")
            a[(a == src.nodata) | ~np.isfinite(a) | (a < 0)] = 0
            lr = np.radians(tr.f + (np.arange(r0, r0 + h) + 0.5) * tr.e)
            cy = np.floor((1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n).astype(int) - y0
            total += a.sum()
            for k in range(h):
                if 0 <= cy[k] < y1 - y0:
                    np.add.at(grid[cy[k]], cx[inside], a[k, inside])
    return grid[ty - y0, tx - x0], total


def wealth_check(regions, reg, pop, fifth):
    """Per region: population share in each national fifth by RWI, beside the DHS share.

    `gap` is the share of people the two place in different fifths (half the sum of
    absolute differences). Regions with a withheld, merged or unweighted fifth are
    left out, because their DHS shares are incomplete.
    """
    out = []
    for j, region in enumerate(regions):
        cells = ((region.get("quintiles") or {}).get("hh_mobile_phone") or {}).get("ownership_by_quintile")
        in_region = reg == j
        people = pop[in_region].sum()
        if (not cells or people == 0
                or any(c["suppressed"] or c.get("merged") or not c.get("denominator_weighted")
                       for c in cells)):
            continue
        weights = [c["denominator_weighted"] for c in cells]
        dhs = [w / sum(weights) for w in weights]
        rwi = [pop[in_region & (fifth == k)].sum() / people for k in range(len(DHS_QUINTILES))]
        out.append({
            "region_id": region["region_id"],
            "rwi_share": [round(float(s), 3) for s in rwi],
            "dhs_share": [round(s, 3) for s in dhs],
            "gap": round(float(sum(abs(a - b) for a, b in zip(rwi, dhs)) / 2), 3),
        })
    return out


def write(path, payload, squares):
    """JSON with one square per line, so a rebuild's diff shows which squares changed."""
    head = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    rows = ",\n".join("  " + json.dumps(s, separators=(",", ":")) for s in squares)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(head[:-2] + ',\n "squares": [\n' + rows + "\n ]\n}\n")
    log("wrote   %s (%.2f MB)" % (path.name, path.stat().st_size / 1e6))


def run():
    rows = np.array(fetch_rwi.read_rows())
    lat, lon, rwi, err = rows.T
    regions = read_json(OUT / "regions.json")["regions"]

    order = np.argsort(rwi, kind="stable")  # poorest first
    lat, lon, rwi, err = lat[order], lon[order], rwi[order], err[order]
    tx, ty = tile_xy(lon, lat)
    if len(set(zip(tx.tolist(), ty.tolist()))) != len(tx):
        fail("two RWI squares share a zoom-%d tile" % RWI_TILE_ZOOM)

    reg = assign_regions(lon, lat, [shape(r["geometry"]) for r in regions])
    pop, total = population(tx, ty)
    covered = pop.sum()
    log("people  %.2fM of WorldPop's %.2fM live in RWI squares (%.1f%%)"
        % (covered / 1e6, total / 1e6, covered / total * 100))

    # National fifths by population: a square's fifth is where its middle person falls.
    cum = np.cumsum(pop) - pop / 2
    fifth = np.minimum(len(DHS_QUINTILES) - 1, (cum / covered * len(DHS_QUINTILES)).astype(int))

    check = wealth_check(regions, reg, pop, fifth)
    if check:
        gaps = sorted(c["gap"] for c in check)
        log("check   %d regions compared; median gap %.1f%%" % (len(check), gaps[len(gaps) // 2] * 100))

    squares = [[int(x), int(y), round(float(w), 3), round(float(e), 3), int(g), int(round(p)), int(f)]
               for x, y, w, e, g, p, f in zip(tx, ty, rwi, err, reg, pop, fifth)]
    payload = {
        "schema_version": SCHEMA_VERSION,
        "fields": FIELDS,
        "tile_zoom": RWI_TILE_ZOOM,
        "regions": [r["region_id"] for r in regions],
        "pop_total": int(round(total)),
        "sources": {
            "rwi": {"name": "Relative Wealth Index, Data for Good at Meta", "license": "CC BY-NC 4.0",
                    "citation": "Chi et al., PNAS 2022"},
            "worldpop": {"year": WORLDPOP_YEAR, "resolution": "100 m", "type": "constrained"},
        },
        "wealth_check": check,
    }
    write(OUT / "squares.json", payload, squares)


if __name__ == "__main__":
    main(run)

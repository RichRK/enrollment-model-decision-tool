"""Download the WorldPop constrained population raster for Madagascar.

Constrained means built-settlement-masked: population is only distributed onto
cells where buildings were detected, which matters here because Madagascar has
large genuinely uninhabited areas that an unconstrained raster would smear
population across.

This is a MODELLED projection for 2025, not a census count. Madagascar's last
census was 2018. The vintage travels to the UI labelled as modelled.
"""

import rasterio

from config import RAW, WORLDPOP_URL, WORLDPOP_YEAR
from common import download, fail, log, main


def run():
    dest = RAW / ("worldpop_mdg_%d_constrained_100m.tif" % WORLDPOP_YEAR)
    download(WORLDPOP_URL, dest)

    # A truncated GeoTIFF will read as a valid file right up until the missing
    # tiles are touched, so check the whole raster opens and has plausible extent.
    try:
        with rasterio.open(dest) as src:
            bounds = src.bounds
            log("raster  %dx%d px, crs=%s" % (src.width, src.height, src.crs))
            log("bounds  lon %.2f..%.2f  lat %.2f..%.2f"
                % (bounds.left, bounds.right, bounds.bottom, bounds.top))
            if not (42 < bounds.left < 46 and 48 < bounds.right < 52):
                fail("raster bounds do not look like Madagascar: %s" % (bounds,))
    except rasterio.errors.RasterioIOError as exc:
        dest.unlink(missing_ok=True)
        fail("downloaded raster will not open (%s). Deleted it; re-run to retry." % exc)


if __name__ == "__main__":
    main(run)

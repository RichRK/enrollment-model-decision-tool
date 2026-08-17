"""The targeting-distortion arithmetic, in one place.

This is the calculation the whole tool is built around, so it gets its own module
rather than living inside whichever caller happened to need it first.

It runs at two levels and the arithmetic is identical at both:

*   nationally, over the aggregate API's five wealth-quintile rows (build.py), and
*   per region, over the recode-derived region x quintile cells (fetch_recode.py).

Deliberately knows nothing about config: the quintile order and the group definitions
arrive as arguments. That keeps the one place the metric is defined independent of the
one place the project's judgement calls are recorded.
"""


def gradient_metrics(ordered_cells, quintiles, bottom_group, top_group):
    """Composition, group rates, exclusion gap and targeting distortion.

    `ordered_cells` is one cell per quintile, in `quintiles` order, each carrying a
    `value` (a percentage) and a `denominator_weighted`.

    Returns None when the reachable pool or the population is empty -- there is no
    meaningful share of nothing. The caller decides what that means: build.py stops
    the build, fetch_recode.py records a pending_reason, and those are genuinely
    different responses to the same condition.
    """
    # Reachable pool: the weighted count in each quintile who have the thing.
    # Denominators differ by indicator (households for household indicators, women
    # interviewed for women's indicators), so shares are computed within an
    # indicator and never across them.
    pool = [c["value"] / 100.0 * c["denominator_weighted"] for c in ordered_cells]
    population = [c["denominator_weighted"] for c in ordered_cells]
    pool_total, population_total = sum(pool), sum(population)
    if pool_total <= 0 or population_total <= 0:
        return None

    composition = [p / pool_total for p in pool]
    population_share = [p / population_total for p in population]

    def group_rate(names):
        idx = [quintiles.index(n) for n in names]
        num = sum(pool[i] for i in idx)
        den = sum(population[i] for i in idx)
        return (num / den * 100.0) if den else None

    # exclusion_gap: ownership in the bottom group minus ownership in the top group,
    # each weighted within its own group.
    bottom_rate, top_rate = group_rate(bottom_group), group_rate(top_group)

    def distortion(names):
        """Share of the reachable pool divided by share of the population. 1.0 is
        neutral; below 1.0 means the channel selects against the group."""
        idx = [quintiles.index(n) for n in names]
        den = sum(population_share[i] for i in idx)
        return (sum(composition[i] for i in idx) / den) if den else None

    return {
        "composition": composition,
        "population_share": population_share,
        "bottom_rate": bottom_rate,
        "top_rate": top_rate,
        "exclusion_gap": (bottom_rate - top_rate)
                         if None not in (bottom_rate, top_rate) else None,
        # The headline figure is the single bottom quintile, as the spec defines it.
        "targeting_distortion": distortion(quintiles[:1]),
        # The bottom-group figure rests on roughly twice the sample and is the one to
        # quote where a single cell is thin, so both are computed.
        "targeting_distortion_bottom_group": distortion(bottom_group),
    }

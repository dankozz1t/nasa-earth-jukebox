from dataclasses import dataclass

import numpy as np

from earth_sound.domain.weather.grid import VARIABLES, WeatherGrid


@dataclass(frozen=True, slots=True)
class Reading:
    observed_at: str
    is_snapshot: bool
    means: dict[str, float]  # weighted by cos(latitude)
    maxima: dict[str, float]


def summarize(grid: WeatherGrid) -> Reading:
    weights = np.cos(np.radians(grid.lats))
    means: dict[str, float] = {}
    maxima: dict[str, float] = {}
    for name in VARIABLES:
        values = grid.values[name]
        means[name] = float(np.average(values.mean(axis=1), weights=weights))
        maxima[name] = float(values.max())
    return Reading(observed_at=grid.observed_at, is_snapshot=grid.is_snapshot, means=means, maxima=maxima)

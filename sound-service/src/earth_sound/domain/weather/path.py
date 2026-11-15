"""The sine path around the planet: time runs west to east, latitude follows a cosine starting at the north."""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from earth_sound.domain.weather.grid import WeatherGrid
from earth_sound.domain.weather.sections import Section, normalize

F64 = npt.NDArray[np.float64]

MAX_LAT = 80.0


@dataclass(frozen=True, slots=True)
class SinePath:
    cycles: float
    amplitude: float

    def latitude(self, t: F64 | float) -> F64:
        return np.asarray(self.amplitude * MAX_LAT * np.cos(2 * np.pi * self.cycles * np.asarray(t)), dtype=np.float64)

    @staticmethod
    def longitude(t: F64 | float) -> F64:
        return np.asarray(-180.0 + 360.0 * np.asarray(t), dtype=np.float64)


def pan_for_latitude(lat: F64 | float) -> F64:
    """North is left (-1), south is right (+1)."""
    return np.asarray(np.clip(-np.asarray(lat) / MAX_LAT, -1.0, 1.0), dtype=np.float64)


@dataclass(frozen=True, slots=True)
class BarFeatures:
    bar: int
    lon_start: float
    lon_end: float
    lat_mean: float
    hemisphere: str  # "north", "south" or "equator"
    value_mean: float
    value_min: float
    value_max: float
    level: float  # 0..1 mean
    level_peak: float  # 0..1 max


def bar_features(
    grid: WeatherGrid, section: Section, path: SinePath, bars: int, samples_per_bar: int = 16
) -> list[BarFeatures]:
    out: list[BarFeatures] = []
    for b in range(bars):
        t = (b + (np.arange(samples_per_bar) + 0.5) / samples_per_bar) / bars
        lats = path.latitude(t)
        lons = SinePath.longitude(t)
        values = np.array([grid.sample(section.variable, la, lo) for la, lo in zip(lats, lons, strict=True)])
        levels = np.array([normalize(section, v) for v in values])
        lat_mean = float(lats.mean())
        hemisphere = "equator" if abs(lat_mean) < 5 else ("north" if lat_mean > 0 else "south")
        out.append(
            BarFeatures(
                bar=b,
                lon_start=float(lons[0]),
                lon_end=float(lons[-1]),
                lat_mean=round(lat_mean, 1),
                hemisphere=hemisphere,
                value_mean=round(float(values.mean()), 2),
                value_min=round(float(values.min()), 2),
                value_max=round(float(values.max()), 2),
                level=round(float(levels.mean()), 3),
                level_peak=round(float(levels.max()), 3),
            )
        )
    return out


def path_samples(grid: WeatherGrid, section: Section, path: SinePath, n: int) -> dict[str, F64]:
    t = (np.arange(n) + 0.5) / n
    lats = path.latitude(t)
    lons = SinePath.longitude(t)
    values = np.array([grid.sample(section.variable, la, lo) for la, lo in zip(lats, lons, strict=True)])
    return {
        "t": t,
        "lat": lats,
        "lon": lons,
        "value": values,
        "level": np.array([normalize(section, v) for v in values]),
    }

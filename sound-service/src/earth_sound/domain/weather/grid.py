"""Global weather on a regular lat/lon grid."""

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt

F64 = npt.NDArray[np.float64]

VARIABLES = ("temperature", "precipitation", "clouds", "wind")


@dataclass(frozen=True, slots=True)
class WeatherGrid:
    lats: F64  # ascending, cell centres
    lons: F64  # ascending, cell centres, in [-180, 180)
    values: dict[str, F64]  # variable -> [len(lats), len(lons)]
    observed_at: str
    source: str
    is_snapshot: bool = False  # bundled fallback, not live
    notes: tuple[str, ...] = field(default_factory=tuple)
    fetched_at: str | None = None
    next_update_at: str | None = None  # ISO UTC, a retry time for a snapshot

    def sample(self, variable: str, lat: float, lon: float) -> float:
        """Bilinear interpolation; longitude wraps around, latitude is clamped."""
        grid = self.values[variable]
        lats, lons = self.lats, self.lons
        lat = float(np.clip(lat, lats[0], lats[-1]))
        i = int(np.clip(np.searchsorted(lats, lat) - 1, 0, len(lats) - 2))
        ty = (lat - lats[i]) / (lats[i + 1] - lats[i])

        step = lons[1] - lons[0]
        x = ((lon - lons[0]) / step) % len(lons)
        j0 = int(np.floor(x)) % len(lons)
        j1 = (j0 + 1) % len(lons)
        tx = x - np.floor(x)

        top = grid[i, j0] * (1 - tx) + grid[i, j1] * tx
        bottom = grid[i + 1, j0] * (1 - tx) + grid[i + 1, j1] * tx
        return float(top * (1 - ty) + bottom * ty)


def regular_axes(step: float) -> tuple[F64, F64]:
    lats = np.arange(-90 + step / 2, 90, step)
    lons = np.arange(-180 + step / 2, 180, step)
    return lats.astype(np.float64), lons.astype(np.float64)

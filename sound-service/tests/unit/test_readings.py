import numpy as np

from earth_sound.domain.weather.readings import summarize
from tests.fakes.weather import synthetic_grid


def test_summarize_weights_by_latitude() -> None:
    grid = synthetic_grid()
    reading = summarize(grid)
    plain = float(grid.values["temperature"].mean())
    assert reading.means["temperature"] > plain  # the warm tropics cover more area than the cold poles
    weights = np.cos(np.radians(grid.lats))
    expected = float((grid.values["temperature"].mean(axis=1) * weights).sum() / weights.sum())
    assert reading.means["temperature"] == np.float64(expected)
    assert reading.maxima["wind"] == float(grid.values["wind"].max())
    assert (reading.observed_at, reading.is_snapshot) == ("2026-11-14T12:00Z", False)
    assert set(reading.means) == set(reading.maxima) == {"temperature", "precipitation", "clouds", "wind"}

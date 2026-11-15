"""Fakes for the weather pipeline: a synthetic grid and scripted AI composers."""

from typing import Any

import numpy as np

from earth_sound.application.ports.composer import ComposerError, ComposerRequest
from earth_sound.domain.weather.grid import WeatherGrid, regular_axes
from earth_sound.domain.weather.readings import Reading, summarize


def synthetic_grid() -> WeatherGrid:
    lats, lons = regular_axes(10.0)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    return WeatherGrid(
        lats=lats,
        lons=lons,
        values={
            "temperature": 30 * np.cos(np.radians(la)) - 10,  # warm tropics, cold poles
            "precipitation": np.where((lo > 0) & (lo < 60) & (np.abs(la) < 20), 4.0, 0.0),  # one rain band
            "clouds": 50 + 50 * np.sin(np.radians(lo)),
            "wind": 10 + 0.4 * np.abs(la),
        },
        observed_at="2026-11-14T12:00Z",
        source="synthetic",
    )


class FakeWeather:
    def __init__(self) -> None:
        self.calls = 0

    def current(self) -> WeatherGrid:
        self.calls += 1
        return synthetic_grid()

    def readings(self) -> list[Reading]:
        return [summarize(synthetic_grid())]


class ScriptedComposer:
    available = True
    name = "ai:fake"

    def __init__(self) -> None:
        self.requests: list[ComposerRequest] = []

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        self.requests.append(request)
        bars = [
            {
                "chord": ["I", "V", "vi", "IV"][b % 4],
                "melody": [
                    {"beat": 0, "degree": 2 + b % 5, "length": 1, "velocity": 0.8},
                    {"beat": 2, "degree": 4, "length": 2, "velocity": 0.6},
                    {"beat": 9, "degree": 1, "length": 1, "velocity": 0.6},  # off the bar: dropped
                ],
                "arp_density": 0.5,
                "pad_level": 0.6,
                "percussion": 0.3,
                "accent": b == 0,
            }
            for b in range(request.bars - 1)  # one bar short: padded
        ]
        return {"title": "Fake", "mode": "major", "rationale_en": "Test.", "rationale_uk": "Test (uk).", "bars": bars}


class FailingComposer:
    available = True
    name = "ai:failing"

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        raise ComposerError("AI composer could not be reached.")


class NoComposer:
    available = False
    name = "ai:off"

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        raise ComposerError("off")

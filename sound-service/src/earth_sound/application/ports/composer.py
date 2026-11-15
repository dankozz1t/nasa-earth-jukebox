from dataclasses import dataclass
from typing import Any, Protocol

from earth_sound.domain.weather.grid import WeatherGrid
from earth_sound.domain.weather.readings import Reading
from earth_sound.shared.errors import EarthSoundError


class ComposerError(EarthSoundError):
    """The AI composer gave no plan; the caller falls back to the rules."""

    code = "composer_failed"


@dataclass(frozen=True, slots=True)
class ComposerRequest:
    section: str
    unit: str
    mood: str
    tonic_name: str
    tempo_bpm: int
    bars: int
    observed_at: str
    features: list[dict[str, Any]]  # one per bar


class AiComposer(Protocol):
    @property
    def available(self) -> bool: ...

    @property
    def name(self) -> str: ...

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        """Raw score plan. Raises ComposerError."""
        ...


class WeatherSource(Protocol):
    def current(self) -> WeatherGrid: ...

    def readings(self) -> list[Reading]: ...

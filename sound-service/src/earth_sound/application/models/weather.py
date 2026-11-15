from dataclasses import dataclass

import numpy as np

from earth_sound.domain.sound.weather_mix import WeatherAudio
from earth_sound.domain.weather.arrange import Arrangement
from earth_sound.domain.weather.path import BarFeatures, SinePath
from earth_sound.domain.weather.plan import ScorePlan
from earth_sound.domain.weather.sections import Section


@dataclass(frozen=True, slots=True)
class ComposeWeatherCommand:
    section: str
    cycles: float
    amplitude: float
    duration_sec: float
    composer: str  # auto | ai | algorithmic | aerosol


@dataclass(frozen=True, slots=True)
class WeatherSoundscape:
    id: str
    section: Section
    path: SinePath
    observed_at: str
    source: str
    is_snapshot: bool
    features: tuple[BarFeatures, ...]
    plan: ScorePlan
    arrangement: Arrangement
    audio: WeatherAudio
    samples: dict[str, np.ndarray]
    composer_requested: str
    warnings: tuple[str, ...]

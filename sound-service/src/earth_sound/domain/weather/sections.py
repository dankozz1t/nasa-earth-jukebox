"""Weather sections: what each measures and how it is set to music."""

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Section:
    key: str
    label: str
    unit: str
    variable: str
    low: float  # value mapped to 0 (cold, dry, clear, calm)
    high: float  # value mapped to 1
    log_scale: bool  # heavy-tailed (precipitation), so compress
    palette: str
    tempo_bpm: int
    tonic: int  # pitch class, 0 = C
    lead: str
    arp: str
    texture: str | None  # "rain", "wind" or None
    mood: str  # shown to the AI composer and in the UI


SECTIONS: dict[str, Section] = {
    "temperature": Section(
        key="temperature",
        label="Temperature",
        unit="°C",
        variable="temperature",
        low=-30.0,
        high=40.0,
        log_scale=False,
        palette="thermal",
        tempo_bpm=84,
        tonic=2,  # D
        lead="piano",
        arp="marimba",
        texture=None,
        mood="cold regions sound darker and lower, warm regions brighter and higher",
    ),
    "precipitation": Section(
        key="precipitation",
        label="Precipitation",
        unit="mm/h",
        variable="precipitation",
        low=0.0,
        high=8.0,
        log_scale=True,
        palette="rain",
        tempo_bpm=76,
        tonic=9,  # A
        lead="piano",
        arp="harp",
        texture="rain",
        mood="dry land is sparse and calm, rain bands become dense rippling arpeggios with rain texture",
    ),
    "clouds": Section(
        key="clouds",
        label="Cloud cover",
        unit="%",
        variable="clouds",
        low=0.0,
        high=100.0,
        log_scale=False,
        palette="clouds",
        tempo_bpm=68,
        tonic=5,  # F
        lead="flute",
        arp="harp",
        texture=None,
        mood="clear skies are open and airy, overcast skies are thick soft string pads",
    ),
    "wind": Section(
        key="wind",
        label="Wind speed",
        unit="km/h",
        variable="wind",
        low=0.0,
        high=60.0,
        log_scale=False,
        palette="wind",
        tempo_bpm=96,
        tonic=7,  # G
        lead="flute",
        arp="marimba",
        texture="wind",
        mood="calm air is slow and still, strong winds drive faster rhythms and a whooshing texture",
    ),
}


def normalize(section: Section, value: float) -> float:
    """Measured value to 0..1, clamped."""
    if math.isnan(value):
        return 0.0
    if section.log_scale:
        v = math.log1p(max(0.0, value)) / math.log1p(section.high)
    else:
        v = (value - section.low) / (section.high - section.low)
    return min(1.0, max(0.0, v))

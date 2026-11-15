from pydantic import BaseModel, Field

from earth_sound.adapters.inbound.http.schemas.soundscapes import ApiModel
from earth_sound.application.models.weather import WeatherSoundscape
from earth_sound.domain.weather.grid import WeatherGrid
from earth_sound.domain.weather.readings import Reading
from earth_sound.domain.weather.sections import SECTIONS


class SectionOut(ApiModel):
    key: str
    label: str
    unit: str
    low: float
    high: float
    log_scale: bool
    palette: str
    tempo_bpm: int
    mood: str


class GridOut(ApiModel):
    lats: list[float]
    lons: list[float]
    observed_at: str
    source: str
    is_snapshot: bool
    notes: list[str]
    fetched_at: str | None
    next_update_at: str | None
    values: dict[str, list[list[float]]]


class ReadingOut(ApiModel):
    observed_at: str
    is_snapshot: bool
    means: dict[str, float]
    maxima: dict[str, float]


class ReadingsOut(ApiModel):
    readings: list[ReadingOut]


class ComposeWeatherIn(BaseModel):
    section: str = "temperature"
    cycles: float = Field(default=3.0, ge=0.5, le=12)
    amplitude: float = Field(default=0.8, ge=0.1, le=1.0)
    duration_sec: float = Field(default=60.0, ge=20, le=180, alias="durationSec")
    composer: str = "auto"

    model_config = {"populate_by_name": True}


class PathOut(ApiModel):
    t: list[float]
    lat: list[float]
    lon: list[float]
    value: list[float]
    level: list[float]


class BarOut(ApiModel):
    bar: int
    chord: str
    level: float
    value_mean: float
    hemisphere: str
    accent: bool


class NoteOut(ApiModel):
    part: str
    time: float
    duration: float
    pitch: int
    velocity: float


class PartOut(ApiModel):
    key: str
    instrument: str


class ComposerOut(ApiModel):
    requested: str
    used: str
    ai_available: bool


class WeatherArtifactsOut(ApiModel):
    stems: dict[str, str]
    mix: str


class WeatherSoundscapeOut(ApiModel):
    id: str
    section: SectionOut
    observed_at: str
    source: str
    is_snapshot: bool
    cycles: float
    amplitude: float
    max_lat: float
    duration_sec: float
    tempo_bpm: int
    beats_per_bar: int
    sample_rate: int
    mode: str
    title: str
    rationale_en: str
    rationale_uk: str
    composer: ComposerOut
    warnings: list[str]
    path: PathOut
    bars: list[BarOut]
    notes: list[NoteOut]
    parts: list[PartOut]
    artifacts: WeatherArtifactsOut


def section_out(key: str) -> SectionOut:
    s = SECTIONS[key]
    return SectionOut(
        key=s.key,
        label=s.label,
        unit=s.unit,
        low=s.low,
        high=s.high,
        log_scale=s.log_scale,
        palette=s.palette,
        tempo_bpm=s.tempo_bpm,
        mood=s.mood,
    )


def grid_out(g: WeatherGrid) -> GridOut:
    return GridOut(
        lats=[round(float(x), 3) for x in g.lats],
        lons=[round(float(x), 3) for x in g.lons],
        observed_at=g.observed_at,
        source=g.source,
        is_snapshot=g.is_snapshot,
        notes=list(g.notes),
        fetched_at=g.fetched_at,
        next_update_at=g.next_update_at,
        values={k: [[round(float(x), 2) for x in row] for row in v] for k, v in g.values.items()},
    )


def readings_out(readings: list[Reading]) -> ReadingsOut:
    return ReadingsOut(
        readings=[
            ReadingOut(observed_at=r.observed_at, is_snapshot=r.is_snapshot, means=r.means, maxima=r.maxima)
            for r in readings
        ]
    )


def weather_out(s: WeatherSoundscape, ai_available: bool) -> WeatherSoundscapeOut:
    from earth_sound.domain.weather.path import MAX_LAT
    from earth_sound.domain.weather.plan import BEATS_PER_BAR

    samples = s.samples
    instruments = {
        **s.arrangement.instruments,
        **({"texture": s.section.texture} if "texture" in s.audio.stems and s.section.texture else {}),
    }
    return WeatherSoundscapeOut(
        id=s.id,
        section=section_out(s.section.key),
        observed_at=s.observed_at,
        source=s.source,
        is_snapshot=s.is_snapshot,
        cycles=s.path.cycles,
        amplitude=s.path.amplitude,
        max_lat=MAX_LAT,
        duration_sec=round(s.arrangement.duration_sec, 4),
        tempo_bpm=s.arrangement.tempo_bpm,
        beats_per_bar=BEATS_PER_BAR,
        sample_rate=s.audio.sample_rate,
        mode=s.plan.mode,
        title=s.plan.title,
        rationale_en=s.plan.rationale_en,
        rationale_uk=s.plan.rationale_uk,
        composer=ComposerOut(requested=s.composer_requested, used=s.plan.composer, ai_available=ai_available),
        warnings=list(s.warnings),
        path=PathOut(
            t=[round(float(x), 5) for x in samples["t"]],
            lat=[round(float(x), 3) for x in samples["lat"]],
            lon=[round(float(x), 3) for x in samples["lon"]],
            value=[round(float(x), 3) for x in samples["value"]],
            level=[round(float(x), 4) for x in samples["level"]],
        ),
        bars=[
            BarOut(
                bar=f.bar,
                chord=s.plan.bars[f.bar].chord,
                level=f.level,
                value_mean=f.value_mean,
                hemisphere=f.hemisphere,
                accent=s.plan.bars[f.bar].accent,
            )
            for f in s.features
        ],
        notes=[
            NoteOut(
                part=n.part,
                time=round(n.time, 4),
                duration=round(n.duration, 4),
                pitch=n.pitch,
                velocity=round(n.velocity, 3),
            )
            for n in s.arrangement.notes
        ],
        parts=[PartOut(key=k, instrument=v) for k, v in instruments.items() if k in s.audio.stems],
        artifacts=WeatherArtifactsOut(stems={k: f"stems/{k}.wav" for k in s.audio.stems}, mix="mix.wav"),
    )

"""JSON contract. camelCase on the wire, the C# backend relies on it."""

import math

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from earth_sound.application.models.soundscape import Soundscape
from earth_sound.domain.aerosols.layers import LAYERS, STEM_KEYS
from earth_sound.domain.music.score import NoteEvent


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class LayerOut(ApiModel):
    key: str
    label: str
    color: str
    voice: str
    about: str
    pitch_low: int
    pitch_high: int
    pixel_count: int
    share: float


class ProfileOut(ApiModel):
    coverage: list[float]
    position: list[float | None]


class StepOut(ApiModel):
    chord: str
    strength: list[float]


class NoteOut(ApiModel):
    layer: int
    step: int
    time: float
    duration: float
    pitch: int
    velocity: int


class ArtifactsOut(ApiModel):
    """Paths relative to the soundscape; the backend turns them into public URLs."""

    class_map: str
    stems: dict[str, str]
    mix: str
    midi: str


class SoundscapeOut(ApiModel):
    id: str
    width: int
    height: int
    bins: int
    duration_sec: float
    step_sec: float
    sample_rate: int
    mode: str
    hue_source: str
    warnings: list[str]
    layers: list[LayerOut]
    profiles: list[ProfileOut]
    steps: list[StepOut]
    notes: list[NoteOut]
    bed: list[NoteOut]
    artifacts: ArtifactsOut


def _note(n: NoteEvent) -> NoteOut:
    return NoteOut(
        layer=n.layer,
        step=n.step,
        time=round(n.time, 4),
        duration=round(n.duration, 4),
        pitch=n.pitch,
        velocity=n.velocity,
    )


def to_schema(s: Soundscape) -> SoundscapeOut:
    a = s.analysis
    return SoundscapeOut(
        id=s.id,
        width=a.width,
        height=a.height,
        bins=a.bins,
        duration_sec=s.score.duration_sec,
        step_sec=s.score.step_sec,
        sample_rate=s.sample_rate,
        mode=str(s.score.mode),
        hue_source=a.hue_source,
        warnings=list(a.warnings),
        layers=[
            LayerOut(
                key=layer.key,
                label=layer.label,
                color=layer.color,
                voice=layer.voice_text,
                about=layer.about,
                pitch_low=layer.pitch_low,
                pitch_high=layer.pitch_high,
                pixel_count=a.profiles[k].pixel_count,
                share=round(a.profiles[k].share, 6),
            )
            for k, layer in enumerate(LAYERS)
        ],
        profiles=[
            ProfileOut(
                coverage=[round(float(v), 6) for v in p.coverage],
                position=[None if math.isnan(v) else round(float(v), 5) for v in p.position],
            )
            for p in a.profiles
        ],
        steps=[StepOut(chord=st.chord, strength=[round(v, 4) for v in st.strength]) for st in s.score.steps],
        notes=[_note(n) for n in s.score.notes],
        bed=[_note(n) for n in s.score.bed],
        artifacts=ArtifactsOut(
            class_map="classmap.png",
            stems={key: f"stems/{key}.wav" for key in STEM_KEYS},
            mix="mix.wav",
            midi="score.mid",
        ),
    )

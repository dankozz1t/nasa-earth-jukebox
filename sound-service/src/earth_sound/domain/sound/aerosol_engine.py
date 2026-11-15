"""Plays the weather along the sine path through the aerosol engine.

The weather level stands in for the aerosol map: time is the path, pitch follows the level, and the level
band picks the voice (smoke, pad, bell, air). build_score and render_stems run unchanged.
"""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from earth_sound.domain.aerosols.layers import BED_KEY, LAYERS, Voice
from earth_sound.domain.aerosols.segmentation import FrameAnalysis, LayerProfile
from earth_sound.domain.music.score import Mode, MusicSettings, Score, build_score
from earth_sound.domain.sound.synth import SynthSettings, render_stems
from earth_sound.domain.sound.weather_mix import WeatherAudio, pan_mix
from earth_sound.domain.weather.arrange import Arrangement, PartNote
from earth_sound.domain.weather.path import BarFeatures, SinePath
from earth_sound.domain.weather.plan import BEATS_PER_BAR, PlanBar, ScorePlan
from earth_sound.domain.weather.sections import Section

F64 = npt.NDArray[np.float64]

COMPOSER = "aerosol"
STEP_SEC = 0.5  # same 0.5 s per column as the 64 s / 128 column original
MIN_BINS, MAX_BINS = 32, 256

# Which voice sings which part of the value range, low to high.
BAND_ORDER: tuple[str, ...] = ("black_carbon", "dust", "sulfate", "sea_salt")
BAND_WIDTH = 1 / len(BAND_ORDER)
OVERLAP = 1.35  # above 1 so neighbouring voices crossfade

INSTRUMENT: dict[Voice, str] = {Voice.SMOKE: "smoke", Voice.PAD: "pad", Voice.AIR: "air", Voice.BELL: "bell"}
BED_INSTRUMENT = "drone"


@dataclass(frozen=True, slots=True)
class AerosolPiece:
    score: Score
    plan: ScorePlan
    arrangement: Arrangement
    audio: WeatherAudio


def bins_for(duration_sec: float) -> int:
    return int(min(MAX_BINS, max(MIN_BINS, round(duration_sec / STEP_SEC))))


def band_membership(level: F64, band: int) -> F64:
    """Triangular weight of each level in a voice's band, peaking at the centre."""
    centre = (band + 0.5) * BAND_WIDTH
    return np.asarray(np.clip(1.0 - np.abs(level - centre) / (BAND_WIDTH * OVERLAP), 0.0, 1.0), dtype=np.float64)


def weather_frame(level: F64) -> FrameAnalysis:
    level = np.clip(np.asarray(level, dtype=np.float64), 0.0, 1.0)
    bins = len(level)
    position = 1.0 - level  # as in the aerosol frame, 0 is the highest pitch
    profiles: list[LayerProfile] = []
    for layer in LAYERS:
        weight = band_membership(level, BAND_ORDER.index(layer.key))
        present = weight > 0
        profiles.append(
            LayerProfile(
                coverage=weight,
                position=np.where(present, position, np.nan),
                pixel_count=int(present.sum()),
                share=float(present.mean()) if bins else 0.0,
            )
        )
    return FrameAnalysis(
        width=bins,
        height=1,
        bins=bins,
        class_map=np.zeros((1, bins), dtype=np.uint8),
        profiles=tuple(profiles),
        hues=tuple(layer.fallback_hue for layer in LAYERS),
        hue_source="weather",
        total_detected=sum(p.pixel_count for p in profiles),
    )


def _plan(score: Score, features: list[BarFeatures], section: Section, bar_len: float) -> ScorePlan:
    bars: list[PlanBar] = []
    for f in features:
        step = min(score.bins - 1, int((f.bar + 0.5) * bar_len / score.step_sec))
        chord = score.steps[step].chord
        bars.append(PlanBar(chord=chord, melody=(), arp_density=0.0, pad_level=0.0, percussion=0.0, accent=False))
    return ScorePlan(
        mode="minor",  # D Dorian
        bars=tuple(bars),
        title=f"{section.label} through the aerosol engine",
        rationale_en=(
            "NASA aerosol engine: the same rules that play the aerosol map. Higher values sing higher, "
            "and the voice moves from smoky to pad, bell and airy as the value grows."
        ),
        rationale_uk="",  # the frontend holds the Ukrainian text for rule-based pieces
        composer=COMPOSER,
    )


def _arrangement(score: Score, tempo_bpm: int, bars: int) -> Arrangement:
    notes = [
        PartNote(
            part=LAYERS[n.layer].key if n.layer >= 0 else BED_KEY,
            time=n.time,
            duration=n.duration,
            pitch=n.pitch,
            velocity=n.velocity / 127,
        )
        for n in (*score.notes, *score.bed)
    ]
    notes.sort(key=lambda n: (n.time, n.part))
    return Arrangement(
        tempo_bpm=tempo_bpm,
        bars=bars,
        duration_sec=score.duration_sec,
        notes=tuple(notes),
        instruments={
            **{key: INSTRUMENT[next(x.voice for x in LAYERS if x.key == key)] for key in BAND_ORDER},
            BED_KEY: BED_INSTRUMENT,
        },
    )


def compose_aerosol(
    level_curve: tuple[F64, F64],
    features: list[BarFeatures],
    section: Section,
    path: SinePath,
    sr: int,
) -> AerosolPiece:
    bars = len(features)
    bar_len = 60.0 / section.tempo_bpm * BEATS_PER_BAR
    duration = bars * bar_len  # same length as the other composers
    bins = bins_for(duration)
    centres = (np.arange(bins) + 0.5) / bins
    level = np.interp(centres, level_curve[0], level_curve[1])

    score = build_score(weather_frame(level), MusicSettings(duration_sec=duration, mode=Mode.HARMONY))
    stems = render_stems(score, SynthSettings(sample_rate=sr))
    mix = pan_mix(stems, list(stems), path, duration, sr)
    return AerosolPiece(
        score=score,
        plan=_plan(score, features, section, bar_len),
        arrangement=_arrangement(score, section.tempo_bpm, bars),
        audio=WeatherAudio(stems=stems, mix=mix, sample_rate=sr),
    )

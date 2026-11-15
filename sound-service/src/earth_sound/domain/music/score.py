"""Column profiles to a score: notes per layer plus a soft harmony bed.

Modes: raw is chromatic, scale is D Dorian, harmony snaps to the current chord of a D Dorian progression.
"""

import math
from dataclasses import dataclass
from enum import StrEnum

import numpy as np

from earth_sound.domain.aerosols.layers import LAYERS
from earth_sound.domain.aerosols.segmentation import FrameAnalysis


class Mode(StrEnum):
    RAW = "raw"
    SCALE = "scale"
    HARMONY = "harmony"


# Minimum column coverage for a note, from the lowest to the highest sensitivity.
SENSITIVITY_THRESHOLDS: tuple[float, ...] = (0.006, 0.003, 0.0015, 0.0007, 0.0003)

CHORDS: dict[str, tuple[int, ...]] = {
    "Dm9": (2, 5, 9, 0, 4),
    "Gsus2": (7, 9, 2),
    "Cmaj7": (0, 4, 7, 11),
    "Am7": (9, 0, 4, 7),
}
PROGRESSION: tuple[str, ...] = ("Dm9", "Gsus2", "Cmaj7", "Am7")
CHORD_ROOT: dict[str, int] = {"Dm9": 38, "Gsus2": 43, "Cmaj7": 36, "Am7": 45}
SCALE: tuple[int, ...] = (0, 2, 4, 5, 7, 9, 11)


@dataclass(frozen=True, slots=True)
class MusicSettings:
    duration_sec: float = 64.0
    mode: Mode = Mode.HARMONY
    sensitivity: int = 2
    min_velocity: int = 30
    max_velocity: int = 80  # stops the loudest plumes jumping out
    velocity_curve: float = 0.62
    voice_leading_weight: float = 0.24
    note_steps: float = 1.1  # legato: notes run a little past their step

    @property
    def min_coverage(self) -> float:
        return SENSITIVITY_THRESHOLDS[self.sensitivity]


@dataclass(frozen=True, slots=True)
class NoteEvent:
    layer: int  # index into LAYERS, -1 for the harmony bed
    step: int
    time: float  # seconds
    duration: float  # seconds
    pitch: int
    velocity: int  # MIDI 1..127


@dataclass(frozen=True, slots=True)
class Step:
    chord: str
    strength: tuple[float, ...]  # per layer, 0 = silent


@dataclass(frozen=True, slots=True)
class Score:
    bins: int
    step_sec: float
    duration_sec: float
    mode: Mode
    notes: tuple[NoteEvent, ...]
    bed: tuple[NoteEvent, ...]
    steps: tuple[Step, ...]


def chord_steps(bins: int) -> int:
    return max(1, round(bins / 16))


def chord_at(step: int, bins: int) -> str:
    return PROGRESSION[(step // chord_steps(bins)) % len(PROGRESSION)]


def pitch_classes(mode: Mode, step: int, bins: int) -> tuple[int, ...] | None:
    if mode is Mode.HARMONY:
        return CHORDS[chord_at(step, bins)]
    if mode is Mode.SCALE:
        return SCALE
    return None


def select_pitch(
    target: float,
    classes: tuple[int, ...] | None,
    low: int,
    high: int,
    previous: int | None,
    weight: float,
) -> int:
    """Nearest allowed pitch to the target, pulled toward the previous note."""
    candidates = [p for p in range(low, high + 1) if classes is None or p % 12 in classes]
    if not candidates:
        raise ValueError(f"no allowed pitches in {low}..{high}")

    def cost(p: int) -> float:
        return abs(p - target) + (0.0 if previous is None else weight * abs(p - previous))

    return min(candidates, key=cost)


def build_score(analysis: FrameAnalysis, settings: MusicSettings) -> Score:
    bins = analysis.bins
    step_sec = settings.duration_sec / bins
    strengths = np.zeros((bins, len(LAYERS)))
    notes: list[NoteEvent] = []

    for k, spec in enumerate(LAYERS):
        profile = analysis.profiles[k]
        coverage = profile.coverage
        positive = coverage[coverage >= settings.min_coverage]
        reference = max(float(np.percentile(positive, 95)) if positive.size else 0.0, settings.min_coverage, 1e-9)
        raw: list[tuple[int, int, int]] = []
        previous: int | None = None
        previous_step: int | None = None
        for b in range(bins):
            position = float(profile.position[b])
            if coverage[b] < settings.min_coverage or math.isnan(position):
                continue
            strength = min(1.0, float(coverage[b]) / reference) ** settings.velocity_curve
            strengths[b, k] = strength
            if previous_step is not None and b - previous_step > 3:
                previous = None
            target = spec.pitch_high - min(1.0, max(0.0, position)) * (spec.pitch_high - spec.pitch_low)
            classes = pitch_classes(settings.mode, b, bins)
            if classes is None:
                pitch = round(target)
            else:
                pitch = select_pitch(
                    target, classes, spec.pitch_low, spec.pitch_high, previous, settings.voice_leading_weight
                )
            velocity = round(settings.min_velocity + (settings.max_velocity - settings.min_velocity) * strength)
            raw.append((b, pitch, velocity))
            previous, previous_step = pitch, b

        # merge repeated pitches on consecutive steps into one note
        i = 0
        while i < len(raw):
            j = i
            velocity = raw[i][2]
            while j + 1 < len(raw) and raw[j + 1][0] == raw[j][0] + 1 and raw[j + 1][1] == raw[i][1]:
                j += 1
                velocity = max(velocity, raw[j][2])
            length_steps = raw[j][0] - raw[i][0] + settings.note_steps
            notes.append(
                NoteEvent(
                    layer=k,
                    step=raw[i][0],
                    time=raw[i][0] * step_sec,
                    duration=length_steps * step_sec,
                    pitch=raw[i][1],
                    velocity=velocity,
                )
            )
            i = j + 1

    # bed: one soft root per chord block, so there is something under the gaps between plumes
    bed: list[NoteEvent] = []
    block = chord_steps(bins)
    for s in range(0, bins, block):
        chord = chord_at(s, bins)
        energy = float(strengths[s : s + block].max(axis=1).mean())
        bed.append(
            NoteEvent(
                layer=-1,
                step=s,
                time=s * step_sec,
                duration=block * step_sec * 1.05,
                pitch=CHORD_ROOT[chord],
                velocity=round(28 + 30 * energy),
            )
        )

    notes.sort(key=lambda n: (n.time, n.layer))
    steps = tuple(Step(chord=chord_at(b, bins), strength=tuple(float(x) for x in strengths[b])) for b in range(bins))
    return Score(
        bins=bins,
        step_sec=step_sec,
        duration_sec=settings.duration_sec,
        mode=settings.mode,
        notes=tuple(notes),
        bed=tuple(bed),
        steps=steps,
    )

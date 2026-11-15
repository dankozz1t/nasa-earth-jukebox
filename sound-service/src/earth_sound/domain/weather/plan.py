"""The score plan a composer returns. sanitize_plan repairs raw JSON from the AI."""

import random
from dataclasses import dataclass, field
from typing import Any

from earth_sound.domain.weather.path import BarFeatures
from earth_sound.domain.weather.sections import Section

MAJOR = (0, 2, 4, 5, 7, 9, 11)
MINOR = (0, 2, 3, 5, 7, 8, 10)

# Roman numeral -> (semitones above the tonic, triad quality). MAJOR_CHORDS and MINOR_CHORDS say which fit each mode.
CHORDS: dict[str, tuple[int, str]] = {
    "I": (0, "maj"),
    "ii": (2, "min"),
    "iii": (4, "min"),
    "IV": (5, "maj"),
    "V": (7, "maj"),
    "vi": (9, "min"),
    "i": (0, "min"),
    "iv": (5, "min"),
    "v": (7, "min"),
    "bIII": (3, "maj"),
    "bVI": (8, "maj"),
    "bVII": (10, "maj"),
}
MAJOR_CHORDS = ("I", "ii", "iii", "IV", "V", "vi")
MINOR_CHORDS = ("i", "iv", "v", "bIII", "bVI", "bVII", "V")

MAX_NOTES_PER_BAR = 8
BEATS_PER_BAR = 4


@dataclass(frozen=True, slots=True)
class MelodyNote:
    beat: float  # in the bar, half-beat steps
    degree: int  # 0 = tonic, 7 = octave up, negative = below
    length: float  # beats
    velocity: float


@dataclass(frozen=True, slots=True)
class PlanBar:
    chord: str
    melody: tuple[MelodyNote, ...]
    arp_density: float  # 0..1
    pad_level: float
    percussion: float
    accent: bool  # bell on the downbeat


@dataclass(frozen=True, slots=True)
class ScorePlan:
    mode: str  # "major" or "minor"
    bars: tuple[PlanBar, ...]
    title: str
    rationale_en: str
    rationale_uk: str
    composer: str  # "algorithmic" or "ai:<model>"
    notes: tuple[str, ...] = field(default_factory=tuple)  # what sanitizing had to fix


def scale(mode: str) -> tuple[int, ...]:
    return MAJOR if mode == "major" else MINOR


def _num(value: Any, default: float, low: float, high: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if v != v:  # NaN
        return default
    return min(high, max(low, v))


def sanitize_plan(raw: dict[str, Any], bars: int, composer: str) -> ScorePlan:
    """Repair a raw plan: bar count, known chords, notes on the half-beat grid."""
    fixes: list[str] = []
    mode = raw.get("mode") if raw.get("mode") in ("major", "minor") else "major"
    allowed = MAJOR_CHORDS if mode == "major" else MINOR_CHORDS
    raw_bars = raw.get("bars") if isinstance(raw.get("bars"), list) else []
    if len(raw_bars) != bars:
        fixes.append(f"expected {bars} bars, got {len(raw_bars)}")

    out: list[PlanBar] = []
    for b in range(bars):
        src = (
            raw_bars[b]
            if b < len(raw_bars) and isinstance(raw_bars[b], dict)
            else (raw_bars[-1] if raw_bars and isinstance(raw_bars[-1], dict) else {})
        )
        chord = src.get("chord")
        if chord not in allowed:
            if chord is not None:
                fixes.append(f"bar {b}: chord {chord!r} not in {mode}")
            chord = allowed[0] if b % 4 == 0 else allowed[(b * 3) % len(allowed)]
        notes: list[MelodyNote] = []
        for n in src.get("melody", []) if isinstance(src.get("melody"), list) else []:
            if not isinstance(n, dict):
                continue
            beat = round(_num(n.get("beat"), -1, -1, 99) * 2) / 2
            if not 0 <= beat < BEATS_PER_BAR:
                continue
            degree = round(_num(n.get("degree"), 2, -7, 14))
            length = _num(n.get("length"), 1, 0.5, BEATS_PER_BAR - beat)
            velocity = _num(n.get("velocity"), 0.7, 0.2, 1.0)
            notes.append(MelodyNote(beat=beat, degree=int(degree), length=length, velocity=velocity))
        notes.sort(key=lambda n: n.beat)
        unique: dict[float, MelodyNote] = {n.beat: n for n in notes}  # one note per position
        melody = tuple(list(unique.values())[:MAX_NOTES_PER_BAR])
        out.append(
            PlanBar(
                chord=str(chord),
                melody=melody,
                arp_density=_num(src.get("arp_density"), 0.4, 0, 1),
                pad_level=_num(src.get("pad_level"), 0.5, 0, 1),
                percussion=_num(src.get("percussion"), 0.2, 0, 1),
                accent=bool(src.get("accent", False)),
            )
        )
    return ScorePlan(
        mode=str(mode),
        bars=tuple(out),
        title=str(raw.get("title") or "Weather sketch")[:80],
        rationale_en=str(raw.get("rationale_en") or "")[:600],
        rationale_uk=str(raw.get("rationale_uk") or "")[:600],
        composer=composer,
        notes=tuple(fixes[:10]),
    )


BRIGHT_WHEN_HIGH = {"temperature": True, "wind": True, "precipitation": False, "clouds": False}

PROGRESSIONS = {
    ("major", "bright"): ("I", "V", "vi", "IV"),
    ("major", "calm"): ("vi", "IV", "I", "V"),
    ("major", "soft"): ("IV", "I", "ii", "V"),
    ("minor", "bright"): ("i", "bVI", "bIII", "bVII"),
    ("minor", "calm"): ("i", "iv", "bVI", "V"),
    ("minor", "soft"): ("i", "bVII", "bVI", "bVII"),
}

RHYTHMS = (
    (0.0, 2.0),
    (0.0, 1.5, 3.0),
    (0.0, 1.0, 2.0, 3.0),
    (0.0, 0.5, 1.5, 2.0, 3.0),
    (0.0, 0.5, 1.0, 2.0, 2.5, 3.0),
)


def compose_algorithmic(features: list[BarFeatures], section: Section, seed: int = 5669) -> ScorePlan:
    """Rule-based composer. Also the fallback when AI is off or fails."""
    rng = random.Random(seed)
    mean_level = sum(f.level for f in features) / max(1, len(features))
    bright_high = BRIGHT_WHEN_HIGH.get(section.key, True)
    brightness = mean_level if bright_high else 1 - mean_level
    mode = "major" if brightness >= 0.42 else "minor"
    sc = scale(mode)

    bars: list[PlanBar] = []
    degree = 4
    for f in features:
        block_level = sum(x.level for x in features[f.bar - f.bar % 4 : f.bar - f.bar % 4 + 4]) / 4
        mood = "bright" if block_level > 0.6 else ("calm" if block_level > 0.3 else "soft")
        chord = PROGRESSIONS[(mode, mood)][f.bar % 4]
        root_degree = _chord_root_degree(chord, sc)

        rhythm = RHYTHMS[min(len(RHYTHMS) - 1, int(f.level * len(RHYTHMS)))]
        target = round(2 + f.level * 8)  # higher values sing higher
        notes: list[MelodyNote] = []
        for i, beat in enumerate(rhythm):
            if i == 0:
                # chord tone on the downbeat, near the line
                options = [root_degree + k for k in (0, 2, 4, 7, 9, 11) if abs(root_degree + k - degree) <= 5]
                degree = min(options or [root_degree + 7], key=lambda d: abs(d - target) + 0.5 * abs(d - degree))
            else:
                step = rng.choice((-1, -1, 1, 1, 0, 2, -2))
                degree += step + (1 if degree < target - 2 else -1 if degree > target + 2 else 0)
            degree = max(-2, min(12, degree))
            nxt = rhythm[i + 1] if i + 1 < len(rhythm) else BEATS_PER_BAR
            notes.append(
                MelodyNote(
                    beat=beat,
                    degree=degree,
                    length=max(0.5, nxt - beat),
                    velocity=round(0.45 + 0.45 * f.level + rng.uniform(-0.05, 0.05), 3),
                )
            )
        if f.bar % 8 == 7:  # breathe at phrase ends
            notes = notes[:2]

        lvl, peak = f.level, f.level_peak
        texture = {
            "temperature": (0.2 + 0.5 * lvl, 0.6, 0.15 + 0.2 * lvl),
            "precipitation": (0.1 + 0.85 * peak, 0.5, 0.05 + 0.6 * lvl),
            "clouds": (0.15, 0.3 + 0.65 * lvl, 0.05),
            "wind": (0.2 + 0.6 * lvl, 0.45, 0.15 + 0.7 * lvl),
        }.get(section.key, (0.4, 0.5, 0.2))
        prev_peak = features[f.bar - 1].level_peak if f.bar > 0 else 0
        next_peak = features[f.bar + 1].level_peak if f.bar + 1 < len(features) else 0
        accent = peak > 0.7 and peak >= prev_peak and peak >= next_peak
        bars.append(
            PlanBar(
                chord=chord,
                melody=tuple(notes),
                arp_density=round(min(1.0, texture[0]), 3),
                pad_level=round(min(1.0, texture[1]), 3),
                percussion=round(min(1.0, texture[2]), 3),
                accent=accent,
            )
        )

    word = {"major": "major", "minor": "minor"}[mode]
    return ScorePlan(
        mode=mode,
        bars=tuple(bars),
        title=f"{section.label} along the wave",
        rationale_en=(
            f"Rule-based: {word} mode from the overall {section.label.lower()}; "
            "the melody rises with the value and the texture follows it bar by bar."
        ),
        rationale_uk="",  # the frontend holds the Ukrainian text for rule-based pieces
        composer="algorithmic",
    )


def _chord_root_degree(chord: str, sc: tuple[int, ...]) -> int:
    semis = CHORDS[chord][0]
    return min(range(len(sc)), key=lambda d: abs(sc[d] - semis))

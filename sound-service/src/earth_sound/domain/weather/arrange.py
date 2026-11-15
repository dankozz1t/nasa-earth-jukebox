"""Score plan to notes per part. Whatever the composer wrote, every bar's loudness follows the measured level."""

from dataclasses import dataclass

from earth_sound.domain.weather.path import BarFeatures
from earth_sound.domain.weather.plan import BEATS_PER_BAR, CHORDS, ScorePlan, scale
from earth_sound.domain.weather.sections import Section

PARTS = ("lead", "strings", "bass", "arpeggio", "bells", "percussion")
PERCUSSION_SHAKER = 1
PERCUSSION_RIM = 2


@dataclass(frozen=True, slots=True)
class PartNote:
    part: str
    time: float  # seconds
    duration: float
    pitch: int  # MIDI; for percussion: 1 = shaker, 2 = rim
    velocity: float


@dataclass(frozen=True, slots=True)
class Arrangement:
    tempo_bpm: int
    bars: int
    duration_sec: float
    notes: tuple[PartNote, ...]
    instruments: dict[str, str]


def bars_for(duration_sec: float, tempo_bpm: int) -> int:
    return max(4, round(duration_sec * tempo_bpm / 60 / BEATS_PER_BAR))


def _chord_pitches(chord: str, tonic: int) -> tuple[int, int, int]:
    root, quality = CHORDS[chord]
    third = 4 if quality == "maj" else 3
    base = (tonic + root) % 12
    return base, (base + third) % 12, (base + 7) % 12


def _nearest(pc: int, target: int) -> int:
    """MIDI note of pitch class `pc` closest to `target`."""
    candidates = [pc + 12 * o for o in range(11)]
    return min(candidates, key=lambda p: abs(p - target))


def arrange(
    plan: ScorePlan, features: list[BarFeatures], section: Section, tempo_bpm: int, seed: int = 5669
) -> Arrangement:
    beat = 60.0 / tempo_bpm
    bar_len = beat * BEATS_PER_BAR
    sc = scale(plan.mode)
    tonic_midi = 60 + section.tonic if section.tonic < 6 else 48 + section.tonic  # keeps the lead in range
    notes: list[PartNote] = []
    prev_voicing: list[int] = []

    for b, bar in enumerate(plan.bars):
        t0 = b * bar_len
        level = features[b].level if b < len(features) else 0.5
        dyn = 0.6 + 0.4 * level  # dynamics follow the data
        triad = _chord_pitches(bar.chord, section.tonic)

        for n in bar.melody:
            octave, step = divmod(n.degree, len(sc))
            pitch = tonic_midi + 12 * octave + sc[step]
            notes.append(
                PartNote("lead", t0 + n.beat * beat, n.length * beat * 0.95, max(48, min(96, pitch)), n.velocity * dyn)
            )

        # strings: four voices, each moves as little as possible from the last bar
        targets = prev_voicing or [55, 60, 64, 67]
        voicing = sorted({_nearest(triad[i % 3], targets[i]) for i in range(4)})
        while len(voicing) < 4:
            voicing.append(voicing[-1] + 12)
        prev_voicing = voicing
        if bar.pad_level > 0.05:
            for p in voicing:
                notes.append(PartNote("strings", t0, bar_len * 1.02, p, 0.35 + 0.5 * bar.pad_level * dyn))

        # bass: root on beats 1 and 3 (one long note in very calm bars)
        root = _nearest(triad[0], 40)
        if level < 0.15:
            notes.append(PartNote("bass", t0, bar_len * 0.95, root, 0.55 * dyn))
        else:
            notes.append(PartNote("bass", t0, beat * 1.8, root, 0.7 * dyn))
            notes.append(
                PartNote("bass", t0 + 2 * beat, beat * 1.8, root if b % 2 == 0 else _nearest(triad[2], 40), 0.6 * dyn)
            )

        # arpeggio: eighth notes, density from the plan
        arp = [_nearest(triad[i % 3], 67 + 12 * (i // 3)) for i in range(6)]
        slots = 8
        count = round(bar.arp_density * slots)
        positions = sorted({round(i * slots / count) % slots for i in range(count)}) if count else []
        for k, pos in enumerate(positions):
            notes.append(
                PartNote(
                    "arpeggio",
                    t0 + pos * beat / 2,
                    beat * 0.9,
                    arp[(k + b) % len(arp)],
                    (0.35 + 0.4 * dyn) * (1 if pos % 2 == 0 else 0.8),
                )
            )

        if bar.accent:
            notes.append(PartNote("bells", t0, beat * 3, _nearest(triad[(b % 2) * 2], 84), 0.6 * dyn))

        # percussion: shaker on sixteenths, soft rim on beats 2 and 4 when busy
        sixteenths = round(bar.percussion * 16)
        for i in range(16):
            if sixteenths and i % max(1, round(16 / sixteenths)) == 0:
                notes.append(
                    PartNote(
                        "percussion",
                        t0 + i * beat / 4,
                        0.08,
                        PERCUSSION_SHAKER,
                        (0.4 if i % 4 else 0.7) * (0.5 + 0.5 * bar.percussion),
                    )
                )
        if bar.percussion > 0.5:
            for i in (1, 3):
                notes.append(PartNote("percussion", t0 + i * beat, 0.05, PERCUSSION_RIM, 0.5 * bar.percussion))

    notes.sort(key=lambda n: (n.time, n.part))
    return Arrangement(
        tempo_bpm=tempo_bpm,
        bars=len(plan.bars),
        duration_sec=len(plan.bars) * bar_len,
        notes=tuple(notes),
        instruments={
            "lead": section.lead,
            "strings": "strings",
            "bass": "bass",
            "arpeggio": section.arp,
            "bells": "bell",
            "percussion": "shaker",
        },
    )

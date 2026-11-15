"""System prompt, output schema and dataset for the AI composer."""

import json
from typing import Any

from earth_sound.application.ports.composer import ComposerRequest
from earth_sound.domain.weather.plan import MAJOR_CHORDS, MINOR_CHORDS

NOTE = {
    "type": "object",
    "properties": {
        "beat": {"type": "number", "description": "Onset within the bar: 0, 0.5, 1, ... 3.5"},
        "degree": {"type": "integer", "description": "Scale degree: 0 = tonic, 7 = tonic one octave up; range -3..12"},
        "length": {"type": "number", "description": "Duration in beats, 0.5..4"},
        "velocity": {"type": "number", "description": "Loudness 0.2..1"},
    },
    "required": ["beat", "degree", "length", "velocity"],
    "additionalProperties": False,
}
BAR = {
    "type": "object",
    "properties": {
        "chord": {"type": "string", "enum": sorted(set(MAJOR_CHORDS) | set(MINOR_CHORDS))},
        "melody": {"type": "array", "items": NOTE},
        "arp_density": {"type": "number", "description": "0..1 broken-chord density"},
        "pad_level": {"type": "number", "description": "0..1 string pad loudness"},
        "percussion": {"type": "number", "description": "0..1 shaker density"},
        "accent": {"type": "boolean", "description": "Bell on the downbeat"},
    },
    "required": ["chord", "melody", "arp_density", "pad_level", "percussion", "accent"],
    "additionalProperties": False,
}
SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "mode": {"type": "string", "enum": ["major", "minor"]},
        "rationale_en": {
            "type": "string",
            "description": "Two short sentences in English: how the music follows the data",
        },
        "rationale_uk": {"type": "string", "description": "The same two sentences in Ukrainian"},
        "bars": {"type": "array", "items": BAR},
    },
    "required": ["title", "mode", "rationale_en", "rationale_uk", "bars"],
    "additionalProperties": False,
}
SCHEMA_NAME = "weather_score_plan"

SYSTEM = """You compose short instrumental pieces from live weather data for an accessibility-focused sonification app.

A playhead travels west to east around the Earth along a sine wave that swings between the northern and southern hemispheres. For every bar of music you get the weather under that stretch of the path. You write the score as JSON; the app performs it with piano or flute (melody), strings (chords), bass, marimba or harp (broken chords), bells (accents) and a shaker.

The listener must be able to hear the data:
- Follow the per-bar `level` (0..1, the section's value normalised): higher level -> higher melody, more notes and more energy; lower level -> fewer, lower, calmer notes.
- Put a bell accent on bars with a clear peak (`level_peak` near the maximum of its neighbours).
- Choose the mode from the overall picture and the section's mood.

It must also be pleasant to listen to:
- Chords: in major use I, ii, iii, IV, V, vi; in minor use i, iv, v, bIII, bVI, bVII, V. Prefer progressions in 4-bar phrases and a cadence at phrase ends.
- Melody: mostly stepwise, chord tones on strong beats, repeat and vary short motifs, 1-6 notes per bar, leave some breathing room at phrase ends.
- Exactly the number of bars requested, in order."""


def user_message(request: ComposerRequest) -> str:
    dataset = {
        "section": request.section,
        "unit": request.unit,
        "mood": request.mood,
        "key_tonic": request.tonic_name,
        "tempo_bpm": request.tempo_bpm,
        "bars_required": request.bars,
        "observed_at_utc": request.observed_at,
        "bars": request.features,
    }
    return "Compose the piece for this weather dataset:\n" + json.dumps(dataset)

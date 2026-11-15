"""Serve the files of a stored soundscape: stems, mix, MIDI, class map."""

from dataclasses import dataclass

from earth_sound.application.models.soundscape import Soundscape
from earth_sound.application.ports.encoders import AudioEncoder, ClassMapEncoder, MidiEncoder
from earth_sound.application.ports.store import SoundscapeStore
from earth_sound.domain.aerosols.layers import BED_KEY, LAYER_KEYS, STEM_KEYS
from earth_sound.domain.sound.synth import mix
from earth_sound.shared.errors import InvalidInputError, NotFoundError


@dataclass(frozen=True, slots=True)
class Artifact:
    content: bytes
    media_type: str
    filename: str


def parse_layers(raw: str | None) -> tuple[str, ...]:
    """Comma-separated layer keys. None or empty means all."""
    if not raw:
        return LAYER_KEYS
    keys = tuple(k.strip() for k in raw.split(",") if k.strip())
    unknown = [k for k in keys if k not in LAYER_KEYS]
    if unknown:
        raise InvalidInputError(f"unknown layer(s): {', '.join(unknown)}")
    return keys


class GetArtifact:
    def __init__(
        self,
        store: SoundscapeStore,
        audio: AudioEncoder,
        midi: MidiEncoder,
        class_map: ClassMapEncoder,
    ) -> None:
        self._store = store
        self._audio = audio
        self._midi = midi
        self._class_map = class_map

    def _load(self, soundscape_id: str) -> Soundscape:
        soundscape = self._store.get(soundscape_id)
        if soundscape is None:
            raise NotFoundError("soundscape not found or expired; compose it again")
        return soundscape

    def stem(self, soundscape_id: str, key: str) -> Artifact:
        if key not in STEM_KEYS:
            raise NotFoundError(f"unknown stem: {key}")
        s = self._load(soundscape_id)
        return Artifact(self._audio.encode(s.stems[key], s.sample_rate), self._audio.media_type, f"{key}.wav")

    def mix(self, soundscape_id: str, layers: str | None, bed: bool) -> Artifact:
        s = self._load(soundscape_id)
        keys = parse_layers(layers) + ((BED_KEY,) if bed else ())
        return Artifact(self._audio.encode(mix(s.stems, keys), s.sample_rate), self._audio.media_type, "mix.wav")

    def midi(self, soundscape_id: str, layers: str | None, bed: bool) -> Artifact:
        s = self._load(soundscape_id)
        keys = parse_layers(layers)
        enabled = tuple(i for i, k in enumerate(LAYER_KEYS) if k in keys)
        text = f"Source: {s.source_label}. Image-derived spatial scan west to east; not raw GEOS values."
        return Artifact(self._midi.encode(s.score, enabled, bed, text), self._midi.media_type, "score.mid")

    def class_map(self, soundscape_id: str) -> Artifact:
        s = self._load(soundscape_id)
        return Artifact(self._class_map.encode(s.analysis.class_map), self._class_map.media_type, "classmap.png")

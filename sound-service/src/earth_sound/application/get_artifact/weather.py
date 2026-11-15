"""Serve the files of a stored weather soundscape."""

import numpy as np

from earth_sound.application.get_artifact.use_case import Artifact
from earth_sound.application.models.weather import WeatherSoundscape
from earth_sound.application.ports.encoders import AudioEncoder
from earth_sound.application.ports.store import WeatherStore
from earth_sound.domain.sound.weather_mix import pan_mix
from earth_sound.shared.errors import InvalidInputError, NotFoundError


class GetWeatherArtifact:
    def __init__(self, store: WeatherStore, audio: AudioEncoder) -> None:
        self._store = store
        self._audio = audio

    def _load(self, soundscape_id: str) -> WeatherSoundscape:
        s = self._store.get(soundscape_id)
        if s is None:
            raise NotFoundError("weather soundscape not found or expired; compose it again")
        return s

    def stem(self, soundscape_id: str, key: str) -> Artifact:
        s = self._load(soundscape_id)
        if key not in s.audio.stems:
            raise NotFoundError(f"unknown stem: {key}")
        return Artifact(
            self._audio.encode(s.audio.stems[key], s.audio.sample_rate), self._audio.media_type, f"{key}.wav"
        )

    def mix(self, soundscape_id: str, parts: str | None, mono: bool = False) -> Artifact:
        s = self._load(soundscape_id)
        keys = [k.strip() for k in parts.split(",") if k.strip()] if parts else list(s.audio.stems)
        unknown = [k for k in keys if k not in s.audio.stems]
        if unknown:
            raise InvalidInputError(f"unknown part(s): {', '.join(unknown)}")
        if mono:
            mono_mix = np.clip(np.sum([s.audio.stems[k] for k in keys], axis=0), -1.0, 1.0).astype(np.float32)
            return Artifact(self._audio.encode(mono_mix, s.audio.sample_rate), self._audio.media_type, "mix-mono.wav")
        if not parts:
            return Artifact(self._audio.encode(s.audio.mix, s.audio.sample_rate), self._audio.media_type, "mix.wav")
        stereo = pan_mix(s.audio.stems, keys, s.path, s.arrangement.duration_sec, s.audio.sample_rate)
        return Artifact(self._audio.encode(stereo, s.audio.sample_rate), self._audio.media_type, "mix.wav")

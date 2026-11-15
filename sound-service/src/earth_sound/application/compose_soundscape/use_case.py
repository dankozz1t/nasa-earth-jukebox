"""Aerosol frame in, soundscape out. The id hashes the inputs, so the same request hits the store."""

import hashlib
import logging

from earth_sound.application.models.soundscape import ComposeCommand, Soundscape
from earth_sound.application.ports.encoders import ImageDecoder
from earth_sound.application.ports.store import SoundscapeStore
from earth_sound.domain.aerosols.segmentation import SegmentationSettings, analyze_frame, sample_colorbar_hues
from earth_sound.domain.music.score import SENSITIVITY_THRESHOLDS, MusicSettings, build_score
from earth_sound.domain.sound.synth import SynthSettings, render_stems
from earth_sound.shared.errors import InvalidInputError

logger = logging.getLogger(__name__)

MIN_DURATION_SEC = 10.0
MAX_DURATION_SEC = 180.0


class ComposeSoundscape:
    def __init__(
        self,
        decoder: ImageDecoder,
        store: SoundscapeStore,
        segmentation: SegmentationSettings,
        synth: SynthSettings,
        max_width: int,
    ) -> None:
        self._decoder = decoder
        self._store = store
        self._segmentation = segmentation
        self._synth = synth
        self._max_width = max_width

    @staticmethod
    def soundscape_id(command: ComposeCommand) -> str:
        digest = hashlib.sha256()
        digest.update(command.image)
        digest.update(command.colorbar or b"")
        digest.update(f"{command.mode}|{command.duration_sec:.3f}|{command.sensitivity}".encode())
        return digest.hexdigest()[:16]

    def __call__(self, command: ComposeCommand) -> Soundscape:
        if not MIN_DURATION_SEC <= command.duration_sec <= MAX_DURATION_SEC:
            raise InvalidInputError(f"duration_sec must be between {MIN_DURATION_SEC:g} and {MAX_DURATION_SEC:g}")
        if not 0 <= command.sensitivity < len(SENSITIVITY_THRESHOLDS):
            raise InvalidInputError(f"sensitivity must be between 0 and {len(SENSITIVITY_THRESHOLDS) - 1}")

        soundscape_id = self.soundscape_id(command)
        cached = self._store.get(soundscape_id)
        if cached is not None:
            return cached

        frame = self._decoder.decode(command.image, self._max_width)
        hues = None
        if command.colorbar:
            hues = sample_colorbar_hues(self._decoder.decode(command.colorbar, 4096).hsv)
        try:
            analysis = analyze_frame(frame.hsv, hues, self._segmentation)
        except ValueError as exc:
            raise InvalidInputError(str(exc)) from exc
        score = build_score(
            analysis,
            MusicSettings(duration_sec=command.duration_sec, mode=command.mode, sensitivity=command.sensitivity),
        )
        stems = render_stems(score, self._synth)
        soundscape = Soundscape(
            id=soundscape_id,
            analysis=analysis,
            score=score,
            stems=stems,
            sample_rate=self._synth.sample_rate,
            source_label=command.source_label,
        )
        self._store.put(soundscape)
        logger.info(
            "composed soundscape %s: %dx%d, %d notes, mode=%s, %.0fs",
            soundscape_id,
            analysis.width,
            analysis.height,
            len(score.notes),
            command.mode,
            command.duration_sec,
        )
        return soundscape

from typing import Protocol

import numpy as np
import numpy.typing as npt

from earth_sound.application.models.soundscape import DecodedImage
from earth_sound.domain.music.score import Score


class ImageDecoder(Protocol):
    def decode(self, data: bytes, max_width: int) -> DecodedImage:
        """Raises InvalidInputError."""
        ...


class AudioEncoder(Protocol):
    media_type: str

    def encode(self, samples: npt.NDArray[np.float32], sample_rate: int) -> bytes: ...


class MidiEncoder(Protocol):
    media_type: str

    def encode(self, score: Score, enabled_layers: tuple[int, ...], include_bed: bool, source_text: str) -> bytes: ...


class ClassMapEncoder(Protocol):
    media_type: str

    def encode(self, class_map: npt.NDArray[np.uint8]) -> bytes: ...

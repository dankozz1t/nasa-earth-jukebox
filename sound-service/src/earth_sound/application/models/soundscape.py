from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from earth_sound.domain.aerosols.segmentation import FrameAnalysis
from earth_sound.domain.music.score import Mode, Score


@dataclass(frozen=True, slots=True)
class DecodedImage:
    width: int
    height: int
    hsv: npt.NDArray[np.uint8]  # H x W x 3, Pillow HSV convention


@dataclass(frozen=True, slots=True)
class Soundscape:
    id: str
    analysis: FrameAnalysis
    score: Score
    stems: dict[str, npt.NDArray[np.float32]]
    sample_rate: int
    source_label: str


@dataclass(frozen=True, slots=True)
class ComposeCommand:
    image: bytes
    colorbar: bytes | None
    mode: Mode
    duration_sec: float
    sensitivity: int
    source_label: str

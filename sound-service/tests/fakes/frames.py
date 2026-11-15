import io

import numpy as np
from PIL import Image

BACKGROUND = (8, 12, 20)
SULFATE = (70, 220, 50)
DUST = (195, 160, 220)
BLACK_CARBON = (210, 96, 63)


def paint(width: int, height: int, patches: list[tuple[tuple[int, int, int, int], tuple[int, int, int]]]) -> np.ndarray:
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[:, :] = BACKGROUND
    for (x0, y0, x1, y1), colour in patches:
        rgb[y0:y1, x0:x1] = colour
    return rgb


def to_hsv(rgb: np.ndarray) -> np.ndarray:
    return np.asarray(Image.fromarray(rgb, mode="RGB").convert("HSV"), dtype=np.uint8)


def png_bytes(rgb: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def two_plume_frame() -> np.ndarray:
    return paint(
        512,
        256,
        [
            ((0, 50, 256, 80), SULFATE),
            ((256, 170, 512, 200), DUST),
            ((240, 120, 270, 135), BLACK_CARBON),
        ],
    )

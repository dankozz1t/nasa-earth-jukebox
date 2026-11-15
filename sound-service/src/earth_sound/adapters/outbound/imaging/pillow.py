import io
import warnings

import numpy as np
import numpy.typing as npt
from PIL import Image, UnidentifiedImageError

from earth_sound.application.models.soundscape import DecodedImage
from earth_sound.shared.errors import InvalidInputError

ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
MAX_PIXELS = 40_000_000  # decompression bomb guard

# Class ids are scaled to 0, 50, 100, ... so the browser can recover them with round(v / 50) after any small nudge.
CLASS_STEP = 50


class PillowImageDecoder:
    def decode(self, data: bytes, max_width: int) -> DecodedImage:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as opened:
                    if opened.format not in ALLOWED_FORMATS:
                        raise InvalidInputError(f"unsupported image format: {opened.format}; use PNG, JPEG or WebP")
                    if opened.width * opened.height > MAX_PIXELS:
                        raise InvalidInputError("image is too large")
                    rgb = opened.convert("RGB")
        except InvalidInputError:
            raise
        except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
            raise InvalidInputError("image is too large") from exc
        except (UnidentifiedImageError, OSError) as exc:
            # Pillow's message has internal reprs, keep ours generic.
            raise InvalidInputError("could not read the image; use a valid PNG, JPEG or WebP file") from exc
        if rgb.width > max_width:
            height = max(1, round(rgb.height * max_width / rgb.width))
            rgb = rgb.resize((max_width, height), Image.Resampling.LANCZOS)
        hsv = np.asarray(rgb.convert("HSV"), dtype=np.uint8)
        return DecodedImage(width=rgb.width, height=rgb.height, hsv=hsv)


class PngClassMapEncoder:
    media_type = "image/png"

    def encode(self, class_map: npt.NDArray[np.uint8]) -> bytes:
        scaled = (class_map.astype(np.uint16) * CLASS_STEP).astype(np.uint8)
        buffer = io.BytesIO()
        Image.fromarray(scaled, mode="L").save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()

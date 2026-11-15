"""Colour segmentation of an aerosol frame (HSV, Pillow convention, 0..255) into per-column layer profiles."""

from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt

from earth_sound.domain.aerosols.layers import LAYERS

U8 = npt.NDArray[np.uint8]
F64 = npt.NDArray[np.float64]

MIN_DETECTED_PIXELS = 100


@dataclass(frozen=True, slots=True)
class SegmentationSettings:
    bins: int = 128
    hue_tolerance: int = 14
    minimum_saturation: int = 10
    minimum_value: int = 24
    lat_bands: int = 12


@dataclass(frozen=True, slots=True)
class LayerProfile:
    coverage: F64  # area-weighted share of the column, 0..1
    position: F64  # 0 = north, 1 = south, NaN where absent
    pixel_count: int
    share: float  # share of all detected pixels


@dataclass(frozen=True, slots=True)
class FrameAnalysis:
    width: int
    height: int
    bins: int
    class_map: U8  # 0 = none, 1..4 = LAYERS[i - 1]
    profiles: tuple[LayerProfile, ...]
    hues: tuple[int, ...]
    hue_source: str  # "colorbar" or "fallback"
    total_detected: int
    warnings: tuple[str, ...] = field(default_factory=tuple)


def sample_colorbar_hues(
    hsv: U8,
    sample_x: tuple[float, ...] = (0.2, 0.4, 0.6, 0.8),
    sample_y: float = 0.625,
) -> tuple[int, ...] | None:
    """Median hue of each colour bar swatch, or None if any swatch is unusable."""
    height, width = hsv.shape[:2]
    result: list[int] = []
    for fx in sample_x:
        cx = round(fx * (width - 1))
        cy = round(sample_y * (height - 1))
        rx = max(4, int(width * 0.012))
        ry = max(4, int(height * 0.055))
        patch = hsv[max(0, cy - ry) : min(height, cy + ry + 1), max(0, cx - rx) : min(width, cx + rx + 1)]
        pixels = patch.reshape(-1, 3)
        valid = pixels[(pixels[:, 1] >= 35) & (pixels[:, 2] >= 80)]
        if len(valid) < 5:
            return None
        result.append(int(np.median(valid[:, 0])))
    return tuple(result)


def _hue_distance(hue: npt.NDArray[np.int16], reference: int) -> npt.NDArray[np.int16]:
    direct = np.abs(hue - reference)
    return np.minimum(direct, 256 - direct)


def analyze_frame(
    hsv: U8,
    hues: tuple[int, ...] | None,
    settings: SegmentationSettings | None = None,
) -> FrameAnalysis:
    settings = settings or SegmentationSettings()
    if hsv.ndim != 3 or hsv.shape[2] != 3:
        raise ValueError("expected an H x W x 3 HSV array")
    height, width = hsv.shape[:2]
    if width < settings.bins or height < settings.lat_bands:
        raise ValueError(f"image is too small: need at least {settings.bins} x {settings.lat_bands} pixels")
    warnings: list[str] = []
    hue_source = "colorbar" if hues else "fallback"
    ref_hues = hues or tuple(layer.fallback_hue for layer in LAYERS)
    if not hues:
        warnings.append("Colour bar could not be read; using built-in legend hues.")

    hue = hsv[:, :, 0].astype(np.int16)
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    distances = []
    allowed = []
    for k, layer in enumerate(LAYERS):
        # Stricter floors for sulfate (bright green), or the dark map backdrop gets picked up.
        sat_floor = max(settings.minimum_saturation, 74 if layer.key == "sulfate" else 0)
        val_floor = max(settings.minimum_value, 72 if layer.key == "sulfate" else 0)
        dist = _hue_distance(hue, ref_hues[k])
        distances.append(dist)
        allowed.append((dist <= settings.hue_tolerance) & (sat >= sat_floor) & (val >= val_floor))
    dist_stack = np.stack(distances)
    allowed_stack = np.stack(allowed)
    masked = np.where(allowed_stack, dist_stack, np.int16(10_000))
    winners = np.argmin(masked, axis=0)
    class_map = np.where(allowed_stack.any(axis=0), winners + 1, 0).astype(np.uint8)

    # Weight rows by cos(latitude): near the poles a pixel covers far less of the Earth.
    lat = 90.0 - (np.arange(height) + 0.5) / height * 180.0
    row_weight = np.clip(np.cos(np.radians(lat)), 0.0, None)
    total_weight = float(row_weight.sum())
    bins, bands = settings.bins, settings.lat_bands
    col_starts = np.searchsorted((np.arange(width) * bins) // width, np.arange(bins))
    row_starts = np.searchsorted((np.arange(height) * bands) // height, np.arange(bands))
    bin_width = np.diff(np.append(col_starts, width)).astype(np.float64)

    counts = [int((class_map == k + 1).sum()) for k in range(len(LAYERS))]
    total = sum(counts)
    if total < MIN_DETECTED_PIXELS:
        warnings.append(
            "Almost no aerosol colours were found. This image may not be a NASA SVS 5669 aerosol frame, "
            "or it uses a different legend."
        )

    profiles: list[LayerProfile] = []
    band_centres = (np.arange(bands) + 0.5) / bands
    for k in range(len(LAYERS)):
        weighted = (class_map == k + 1) * row_weight[:, None]
        per_band = np.add.reduceat(np.add.reduceat(weighted, row_starts, axis=0), col_starts, axis=1)  # bands x bins
        column_sum = per_band.sum(axis=0)
        coverage = column_sum / np.maximum(bin_width * total_weight, 1e-12)
        position = np.full(bins, np.nan)
        present = column_sum > 0
        best = np.argmax(per_band, axis=0)
        for b in np.flatnonzero(present):
            lo, hi = max(0, best[b] - 1), min(bands, best[b] + 2)
            w = per_band[lo:hi, b]
            # Centre on the strongest band, not the plain centroid: a north and a south plume
            # would otherwise average out to the empty equator.
            position[b] = float((w * band_centres[lo:hi]).sum() / w.sum())
        profiles.append(
            LayerProfile(
                coverage=coverage.astype(np.float64),
                position=position,
                pixel_count=counts[k],
                share=counts[k] / total if total else 0.0,
            )
        )

    return FrameAnalysis(
        width=width,
        height=height,
        bins=bins,
        class_map=class_map,
        profiles=tuple(profiles),
        hues=tuple(int(h) for h in ref_hues),
        hue_source=hue_source,
        total_detected=total,
        warnings=tuple(warnings),
    )

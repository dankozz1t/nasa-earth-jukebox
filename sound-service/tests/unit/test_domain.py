import math
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from earth_sound.domain.aerosols.layers import BED_KEY, LAYER_KEYS, LAYERS
from earth_sound.domain.aerosols.segmentation import SegmentationSettings, analyze_frame, sample_colorbar_hues
from earth_sound.domain.music.score import CHORDS, Mode, MusicSettings, build_score, chord_at
from earth_sound.domain.sound.synth import SynthSettings, mix, render_stems
from tests.fakes.frames import SULFATE, paint, to_hsv, two_plume_frame

FALLBACK = tuple(layer.fallback_hue for layer in LAYERS)
SETTINGS = SegmentationSettings(bins=32)
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_nasa_colorbar_hues_are_sampled() -> None:
    hsv = np.asarray(Image.open(FIXTURES / "colorbar.png").convert("HSV"), dtype=np.uint8)
    hues = sample_colorbar_hues(hsv)
    assert hues is not None
    for got, expected in zip(hues, FALLBACK, strict=True):
        assert min(abs(got - expected), 256 - abs(got - expected)) <= 8


def test_segmentation_finds_layers_where_painted() -> None:
    a = analyze_frame(to_hsv(two_plume_frame()), FALLBACK, SETTINGS)
    by_key = dict(zip(LAYER_KEYS, a.profiles, strict=True))
    assert by_key["sulfate"].pixel_count == 256 * 30
    assert by_key["dust"].pixel_count == 256 * 30
    assert by_key["black_carbon"].pixel_count > 0
    assert by_key["sea_salt"].pixel_count == 0
    assert by_key["sulfate"].coverage[:16].min() > 0
    assert by_key["sulfate"].coverage[17:].max() == 0
    assert math.isclose(sum(p.share for p in a.profiles), 1.0)
    assert a.warnings == ()


def test_north_is_higher_than_south() -> None:
    a = analyze_frame(to_hsv(two_plume_frame()), FALLBACK, SETTINGS)
    sulfate = a.profiles[LAYER_KEYS.index("sulfate")].position[4]
    dust = a.profiles[LAYER_KEYS.index("dust")].position[24]
    assert sulfate < 0.4 < 0.6 < dust


def test_position_follows_dominant_band_not_the_empty_middle() -> None:
    frame = paint(64, 120, [((0, 20, 64, 40), SULFATE), ((0, 82, 64, 88), SULFATE)])
    a = analyze_frame(to_hsv(frame), FALLBACK, SegmentationSettings(bins=4))
    assert 0.15 < a.profiles[LAYER_KEYS.index("sulfate")].position[0] < 0.34


def test_blank_image_warns_and_too_small_image_fails() -> None:
    a = analyze_frame(to_hsv(paint(64, 32, [])), None, SegmentationSettings(bins=16))
    assert len(a.warnings) == 2
    with pytest.raises(ValueError, match="too small"):
        analyze_frame(to_hsv(paint(8, 8, [])), None, SegmentationSettings(bins=16))


@pytest.fixture(scope="module")
def harmony_score():  # type: ignore[no-untyped-def]
    a = analyze_frame(to_hsv(two_plume_frame()), FALLBACK, SETTINGS)
    return build_score(a, MusicSettings(duration_sec=16, mode=Mode.HARMONY, sensitivity=4))


def test_harmony_mode_uses_only_chord_tones(harmony_score) -> None:  # type: ignore[no-untyped-def]
    assert harmony_score.notes
    for n in harmony_score.notes:
        assert n.pitch % 12 in CHORDS[chord_at(n.step, harmony_score.bins)]
        assert LAYERS[n.layer].pitch_low <= n.pitch <= LAYERS[n.layer].pitch_high
        assert 0 < n.velocity <= 127
        assert 0 <= n.time < 16


def test_raw_mode_is_not_snapped() -> None:
    a = analyze_frame(to_hsv(two_plume_frame()), FALLBACK, SETTINGS)
    raw = build_score(a, MusicSettings(duration_sec=16, mode=Mode.RAW, sensitivity=4))
    harmony = build_score(a, MusicSettings(duration_sec=16, mode=Mode.HARMONY, sensitivity=4))
    assert {n.pitch for n in raw.notes} != {n.pitch for n in harmony.notes}


def test_stems_sum_to_mix_and_do_not_clip(harmony_score) -> None:  # type: ignore[no-untyped-def]
    stems = render_stems(harmony_score, SynthSettings(sample_rate=8000))
    assert set(stems) == {*LAYER_KEYS, BED_KEY}
    full = mix(stems, list(stems))
    peak = float(np.abs(full).max())
    assert 0.4 < peak <= 0.51  # calm default level with headroom
    assert float(np.abs(stems["sulfate"]).max()) > 0.01  # a painted layer is audible
    assert float(np.abs(stems["sea_salt"]).max()) < 1e-6  # an absent layer is silent
    lengths = {len(s) for s in stems.values()}
    assert lengths == {((16 + 5) * 8000)}


def test_render_is_deterministic(harmony_score) -> None:  # type: ignore[no-untyped-def]
    a = render_stems(harmony_score, SynthSettings(sample_rate=8000))
    b = render_stems(harmony_score, SynthSettings(sample_rate=8000))
    assert all(np.array_equal(a[k], b[k]) for k in a)


def test_soften_removes_harsh_highs() -> None:
    from earth_sound.domain.sound.synth import soften

    sr = 22_050
    t = np.arange(sr) / sr
    low = np.sin(2 * np.pi * 440 * t)
    high = np.sin(2 * np.pi * 9000 * t)
    assert float(np.abs(soften(low, sr)).max()) > 0.95  # music range is untouched
    assert float(np.abs(soften(high, sr)).max()) < 0.25  # hiss / sizzle is cut


def test_mix_has_little_energy_above_6khz(harmony_score) -> None:  # type: ignore[no-untyped-def]
    stems = render_stems(harmony_score, SynthSettings(sample_rate=22_050))
    full = mix(stems, list(stems)).astype(np.float64)
    spectrum = np.abs(np.fft.rfft(full)) ** 2
    freqs = np.fft.rfftfreq(len(full), 1 / 22_050)
    assert spectrum[freqs > 6000].sum() / spectrum.sum() < 0.01

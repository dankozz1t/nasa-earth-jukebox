import numpy as np
import pytest

from earth_sound.domain.sound.weather_mix import pan_mix, render_weather
from earth_sound.domain.weather.arrange import arrange, bars_for
from earth_sound.domain.weather.path import SinePath, bar_features, pan_for_latitude, path_samples
from earth_sound.domain.weather.plan import CHORDS, MAJOR_CHORDS, MINOR_CHORDS, compose_algorithmic, sanitize_plan
from earth_sound.domain.weather.sections import SECTIONS, normalize
from tests.fakes.weather import synthetic_grid


def test_grid_sampling_interpolates_and_wraps_longitude() -> None:
    g = synthetic_grid()
    assert g.sample("temperature", 0, 0) > g.sample("temperature", 70, 0)  # tropics warmer than the Arctic
    assert g.sample("clouds", 10, 179.9) == pytest.approx(g.sample("clouds", 10, -180.1), abs=1e-6)  # dateline wraps
    assert g.sample("precipitation", 0, 30) == pytest.approx(4.0)


def test_sine_path_starts_north_and_swings_south() -> None:
    p = SinePath(cycles=2, amplitude=1)
    lat = p.latitude(np.array([0.0, 0.125, 0.25]))
    assert lat[0] == pytest.approx(80)
    assert lat[1] == pytest.approx(0, abs=1e-9)
    assert lat[2] == pytest.approx(-80)
    assert SinePath.longitude(0.5) == pytest.approx(0)


def test_north_is_left_south_is_right() -> None:
    assert pan_for_latitude(60) < 0 < pan_for_latitude(-60)
    assert pan_for_latitude(0) == 0


def test_normalize_clamps_and_compresses_rain() -> None:
    rain = SECTIONS["precipitation"]
    assert normalize(rain, 0) == 0
    assert normalize(rain, 100) == 1
    assert normalize(rain, 1) > 1 / rain.high  # log scale lifts light rain
    assert normalize(SECTIONS["temperature"], float("nan")) == 0


def test_bar_features_follow_the_data() -> None:
    temp = SECTIONS["temperature"]
    features = bar_features(synthetic_grid(), temp, SinePath(cycles=1, amplitude=1), bars=8)
    assert len(features) == 8
    assert features[0].hemisphere == "north"
    # the path crosses the warm equator in the middle bars and the cold north at the start
    assert max(f.level for f in features[1:3]) > features[0].level


@pytest.mark.parametrize("key", list(SECTIONS))
def test_algorithmic_plan_is_valid_and_musical(key: str) -> None:
    section = SECTIONS[key]
    features = bar_features(synthetic_grid(), section, SinePath(3, 0.8), bars=12)
    plan = compose_algorithmic(features, section)
    allowed = MAJOR_CHORDS if plan.mode == "major" else MINOR_CHORDS
    assert len(plan.bars) == 12
    assert all(b.chord in allowed for b in plan.bars)
    assert all(0 <= n.beat < 4 for b in plan.bars for n in b.melody)
    assert sanitize_plan({"mode": plan.mode, "bars": []}, 12, "x").bars  # sanitizer never returns empty


def test_sanitize_repairs_a_bad_ai_answer() -> None:
    plan = sanitize_plan(
        {
            "mode": "minor",
            "bars": [
                {
                    "chord": "I",
                    "melody": [{"beat": 7, "degree": 3}, {"beat": 1.26, "degree": 40, "length": 9, "velocity": 3}],
                }
            ],
            "title": "x" * 500,
        },
        bars=3,
        composer="ai:test",
    )
    assert len(plan.bars) == 3
    assert all(b.chord in MINOR_CHORDS for b in plan.bars)
    note = plan.bars[0].melody[0]
    assert (note.beat, note.degree, note.velocity) == (1.5, 14, 1.0)
    assert note.length == 2.5  # cannot run past the bar
    assert len(plan.title) == 80
    assert any("chord" in fix for fix in plan.notes)
    assert sanitize_plan({"mode": "jazz"}, 2, "x").mode == "major"


def test_arrangement_uses_the_whole_ensemble_and_stays_in_range() -> None:
    section = SECTIONS["temperature"]
    features = bar_features(synthetic_grid(), section, SinePath(3, 0.8), bars=8)
    plan = compose_algorithmic(features, section)
    arr = arrange(plan, features, section, section.tempo_bpm)
    parts = {n.part for n in arr.notes}
    assert {"lead", "strings", "bass", "arpeggio", "percussion"} <= parts
    assert all(0 < n.velocity <= 1.0 for n in arr.notes)
    assert arr.duration_sec == pytest.approx(8 * 4 * 60 / section.tempo_bpm)
    assert all(n.time < arr.duration_sec for n in arr.notes)
    assert bars_for(60, 84) == 21
    assert set(CHORDS) >= set(MAJOR_CHORDS)


def test_render_pans_with_the_path_and_stems_add_up() -> None:
    section = SECTIONS["precipitation"]
    path = SinePath(1, 1)
    grid = synthetic_grid()
    features = bar_features(grid, section, path, bars=4)
    arr = arrange(compose_algorithmic(features, section), features, section, section.tempo_bpm)
    samples = path_samples(grid, section, path, 64)
    audio = render_weather(arr, path, (samples["t"], samples["level"]), section.texture, sr=8000)
    assert "texture" in audio.stems
    assert audio.mix.shape[0] == 2
    assert float(np.abs(audio.mix).max()) <= 0.56
    n = audio.mix.shape[1]
    start = audio.mix[:, : n // 10]  # path starts in the far north: left louder
    assert np.abs(start[0]).mean() > np.abs(start[1]).mean()
    rebuilt = pan_mix(audio.stems, list(audio.stems), path, arr.duration_sec, 8000)
    assert np.allclose(rebuilt, np.clip(audio.mix, -1, 1), atol=2e-3)


def test_aerosol_engine_voices_follow_the_value_band() -> None:
    from earth_sound.domain.aerosols.layers import LAYERS
    from earth_sound.domain.sound.aerosol_engine import BAND_ORDER, weather_frame

    frame = weather_frame(np.array([0.05, 0.5, 0.95]))
    cov = {layer.key: frame.profiles[k].coverage for k, layer in enumerate(LAYERS)}
    assert cov["black_carbon"][0] > 0
    assert cov["black_carbon"][2] == 0
    assert cov["sea_salt"][2] > 0
    assert cov["sea_salt"][0] == 0
    assert cov["dust"][1] > 0
    assert cov["sulfate"][1] > 0
    assert set(BAND_ORDER) == {layer.key for layer in LAYERS}


def test_aerosol_engine_renders_a_weather_piece() -> None:
    from earth_sound.domain.sound.aerosol_engine import compose_aerosol

    g, sec, path = synthetic_grid(), SECTIONS["temperature"], SinePath(cycles=2, amplitude=0.8)
    features = bar_features(g, sec, path, bars_for(24, sec.tempo_bpm))
    s = path_samples(g, sec, path, 256)
    piece = compose_aerosol((s["t"], s["level"]), features, sec, path, sr=8000)
    assert piece.plan.composer == "aerosol"
    assert len(piece.plan.bars) == len(features)
    assert set(piece.audio.stems) == {"black_carbon", "dust", "sea_salt", "sulfate", "bed"}
    assert piece.audio.mix.shape[0] == 2  # stereo, panned by hemisphere
    assert piece.arrangement.duration_sec == pytest.approx(len(features) * 4 * 60 / sec.tempo_bpm)
    assert piece.arrangement.notes
    assert {n.part for n in piece.arrangement.notes} <= set(piece.audio.stems)
    # higher value -> higher pitch within each voice's register, as in the aerosol map
    for layer in {n.layer for n in piece.score.notes}:
        notes = [n for n in piece.score.notes if n.layer == layer]
        if len(notes) < 4:
            continue
        lvl = np.interp([(n.time + 0.01) / piece.score.duration_sec for n in notes], s["t"], s["level"])
        assert np.corrcoef(lvl, [n.pitch for n in notes])[0, 1] > 0.5

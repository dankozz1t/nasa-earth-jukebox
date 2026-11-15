import io
import wave
from pathlib import Path

import mido
import pytest
from fastapi.testclient import TestClient

from earth_sound.bootstrap.container import build_app
from earth_sound.bootstrap.settings import Settings
from tests.fakes.frames import png_bytes, two_plume_frame

COLORBAR = (Path(__file__).resolve().parents[1] / "fixtures" / "colorbar.png").read_bytes()


@pytest.fixture(scope="module")
def client() -> TestClient:
    settings = Settings(sample_rate=8000, bins=32, max_upload_mb=1, cache_size=2)
    return TestClient(build_app(settings))


@pytest.fixture(scope="module")
def composed(client: TestClient) -> dict:  # type: ignore[type-arg]
    response = client.post(
        "/v1/soundscapes",
        files={"image": ("frame.png", png_bytes(two_plume_frame()), "image/png"), "colorbar": ("c.png", COLORBAR)},
        data={"mode": "harmony", "duration_sec": "16", "sensitivity": "4", "source_label": "test frame"},
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def test_health(client: TestClient) -> None:
    assert client.get("/health").json()["status"] == "ok"


def test_compose_returns_camel_case_contract(composed: dict) -> None:  # type: ignore[type-arg]
    assert len(composed["id"]) == 16
    assert composed["hueSource"] == "colorbar"
    assert composed["bins"] == 32
    assert composed["durationSec"] == 16
    assert [layer["key"] for layer in composed["layers"]] == ["black_carbon", "dust", "sea_salt", "sulfate"]
    assert len(composed["profiles"][0]["coverage"]) == 32
    assert None in composed["profiles"][2]["position"]  # sea salt absent -> null, not NaN
    assert composed["notes"]
    assert composed["artifacts"]["stems"]["bed"] == "stems/bed.wav"


def test_same_inputs_give_same_id(client: TestClient, composed: dict) -> None:  # type: ignore[type-arg]
    again = client.post(
        "/v1/soundscapes",
        files={"image": ("frame.png", png_bytes(two_plume_frame()), "image/png"), "colorbar": ("c.png", COLORBAR)},
        data={"mode": "harmony", "duration_sec": "16", "sensitivity": "4"},
    )
    assert again.json()["id"] == composed["id"]


def test_stem_mix_midi_and_class_map(client: TestClient, composed: dict) -> None:  # type: ignore[type-arg]
    sid = composed["id"]
    stem = client.get(f"/v1/soundscapes/{sid}/stems/sulfate.wav")
    assert stem.status_code == 200
    assert stem.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(stem.content)) as w:
        assert (w.getnchannels(), w.getframerate()) == (1, 8000)

    assert client.get(f"/v1/soundscapes/{sid}/mix.wav?layers=dust,sulfate&bed=false").status_code == 200

    midi = client.get(f"/v1/soundscapes/{sid}/score.mid?layers=sulfate&bed=true")
    tracks = mido.MidiFile(file=io.BytesIO(midi.content)).tracks
    assert [t.name for t in tracks] == ["Earth Jukebox / tempo", "Sulfate", "Harmony bed"]

    class_map = client.get(f"/v1/soundscapes/{sid}/classmap.png")
    assert class_map.headers["content-type"] == "image/png"


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/v1/soundscapes/0123456789abcdef/mix.wav", 404),  # unknown id
        ("/v1/soundscapes/not-an-id/mix.wav", 422),  # malformed id
    ],
)
def test_unknown_or_malformed_ids(client: TestClient, path: str, status: int) -> None:
    assert client.get(path).status_code == status


def test_bad_inputs_are_rejected(client: TestClient, composed: dict) -> None:  # type: ignore[type-arg]
    sid = composed["id"]
    assert client.get(f"/v1/soundscapes/{sid}/mix.wav?layers=plutonium").status_code == 400
    assert client.get(f"/v1/soundscapes/{sid}/stems/plutonium.wav").status_code == 404

    not_image = client.post("/v1/soundscapes", files={"image": ("x.png", b"hello", "image/png")})
    assert not_image.status_code == 400
    assert not_image.headers["content-type"] == "application/problem+json"

    too_big = client.post("/v1/soundscapes", files={"image": ("x.png", b"0" * (1024 * 1024 + 1), "image/png")})
    assert too_big.status_code == 400

    bad_mode = client.post(
        "/v1/soundscapes", files={"image": ("f.png", png_bytes(two_plume_frame()))}, data={"mode": "jazz"}
    )
    assert bad_mode.status_code == 422

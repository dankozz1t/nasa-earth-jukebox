import io
import wave

import pytest
from fastapi.testclient import TestClient

from earth_sound.bootstrap.container import build_app
from earth_sound.bootstrap.settings import Settings
from tests.fakes.weather import FailingComposer, FakeWeather, NoComposer, ScriptedComposer

SETTINGS = Settings(sample_rate=8000, weather_cache_size=4)
BODY = {"section": "temperature", "cycles": 2, "amplitude": 0.8, "durationSec": 24, "composer": "auto"}


@pytest.fixture(scope="module")
def ai() -> ScriptedComposer:
    return ScriptedComposer()


@pytest.fixture(scope="module")
def client(ai: ScriptedComposer) -> TestClient:
    return TestClient(build_app(SETTINGS, weather=FakeWeather(), composer=ai))


def test_sections_and_grid(client: TestClient) -> None:
    keys = [s["key"] for s in client.get("/v1/weather/sections").json()]
    assert keys == ["temperature", "precipitation", "clouds", "wind"]
    grid = client.get("/v1/weather/grid").json()
    assert len(grid["lats"]) == 18
    assert len(grid["lons"]) == 36
    assert len(grid["values"]["temperature"]) == 18
    assert grid["isSnapshot"] is False
    assert client.get("/v1/weather/composer").json() == {"aiAvailable": True}


def test_http_readings_contract(client: TestClient) -> None:
    r = client.get("/v1/weather/readings")
    assert r.status_code == 200
    (reading,) = r.json()["readings"]
    assert set(reading) == {"observedAt", "isSnapshot", "means", "maxima"}
    assert set(reading["means"]) == {"temperature", "precipitation", "clouds", "wind"}
    grid = client.get("/v1/weather/grid").json()
    assert {"fetchedAt", "nextUpdateAt"} <= set(grid)


def test_ai_composes_the_score_dataset(client: TestClient, ai: ScriptedComposer) -> None:
    r = client.post("/v1/weather/soundscapes", json=BODY)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["composer"] == {"requested": "auto", "used": "ai:fake", "aiAvailable": True}
    assert s["title"] == "Fake"
    req = ai.requests[-1]
    assert req.bars == len(s["bars"]) == len(req.features)
    assert {"level", "value_mean", "hemisphere", "lat_mean"} <= set(req.features[0])
    assert any("repaired" in w for w in s["warnings"])  # it sent one bar too few
    assert len(s["path"]["lat"]) == 512
    assert s["path"]["lat"][0] == pytest.approx(64, abs=1)  # starts north (0.8 * 80)
    assert {p["key"] for p in s["parts"]} >= {"lead", "strings", "bass", "arpeggio", "percussion"}
    assert s["artifacts"]["mix"] == "mix.wav"


def test_stems_are_mono_and_mix_is_stereo(client: TestClient) -> None:
    sid = client.post("/v1/weather/soundscapes", json=BODY).json()["id"]
    with wave.open(io.BytesIO(client.get(f"/v1/weather/soundscapes/{sid}/stems/lead.wav").content)) as w:
        assert w.getnchannels() == 1
    with wave.open(io.BytesIO(client.get(f"/v1/weather/soundscapes/{sid}/mix.wav").content)) as w:
        assert w.getnchannels() == 2
    assert client.get(f"/v1/weather/soundscapes/{sid}/mix.wav?parts=lead,bass").status_code == 200
    with wave.open(io.BytesIO(client.get(f"/v1/weather/soundscapes/{sid}/mix.wav?mono=true").content)) as w:
        assert w.getnchannels() == 1  # mono: no left/right movement
    assert client.get(f"/v1/weather/soundscapes/{sid}/mix.wav?parts=tuba").status_code == 400
    assert client.get(f"/v1/weather/soundscapes/{sid}/stems/tuba.wav").status_code == 404


def test_algorithmic_on_request(client: TestClient) -> None:
    s = client.post("/v1/weather/soundscapes", json={**BODY, "composer": "algorithmic", "section": "wind"}).json()
    assert s["composer"]["used"] == "algorithmic"
    assert "texture" in {p["key"] for p in s["parts"]}


def test_aerosol_engine_on_request(client: TestClient, ai: ScriptedComposer) -> None:
    calls = len(ai.requests)
    s = client.post("/v1/weather/soundscapes", json={**BODY, "composer": "aerosol"}).json()
    assert s["composer"]["used"] == "aerosol"
    assert len(ai.requests) == calls  # no AI call
    assert {p["key"] for p in s["parts"]} == {"black_carbon", "dust", "sea_salt", "sulfate", "bed"}
    sid = s["id"]
    with wave.open(io.BytesIO(client.get(f"/v1/weather/soundscapes/{sid}/mix.wav").content)) as w:
        assert w.getnchannels() == 2
    assert client.get(f"/v1/weather/soundscapes/{sid}/stems/sea_salt.wav").status_code == 200


@pytest.mark.parametrize(
    ("patch", "status"),
    [({"section": "pollen"}, 400), ({"cycles": 50}, 422), ({"durationSec": 5}, 422), ({"composer": "gpt"}, 400)],
)
def test_bad_requests(client: TestClient, patch: dict[str, object], status: int) -> None:
    assert client.post("/v1/weather/soundscapes", json={**BODY, **patch}).status_code == status


def test_failing_or_missing_ai_falls_back_to_algorithmic() -> None:
    failing = TestClient(build_app(SETTINGS, weather=FakeWeather(), composer=FailingComposer()))
    s = failing.post("/v1/weather/soundscapes", json=BODY).json()
    assert s["composer"]["used"] == "algorithmic"
    assert any("could not be reached" in w for w in s["warnings"])

    off = TestClient(build_app(SETTINGS, weather=FakeWeather(), composer=NoComposer()))
    s = off.post("/v1/weather/soundscapes", json={**BODY, "composer": "ai"}).json()
    assert s["composer"] == {"requested": "ai", "used": "algorithmic", "aiAvailable": False}
    assert any("not configured" in w for w in s["warnings"])

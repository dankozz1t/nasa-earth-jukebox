from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Path, Query
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from earth_sound.adapters.inbound.http.routers.soundscapes import _send
from earth_sound.adapters.inbound.http.schemas.weather import (
    ComposeWeatherIn,
    GridOut,
    ReadingsOut,
    SectionOut,
    WeatherSoundscapeOut,
    grid_out,
    readings_out,
    section_out,
    weather_out,
)
from earth_sound.application.compose_weather.use_case import ComposeWeather
from earth_sound.application.get_artifact.weather import GetWeatherArtifact
from earth_sound.application.models.weather import ComposeWeatherCommand
from earth_sound.application.ports.composer import WeatherSource
from earth_sound.domain.weather.sections import SECTIONS

SoundscapeId = Annotated[str, Path(pattern=r"^[0-9a-f]{16}$")]
StemKey = Annotated[str, Path(pattern=r"^[a-z_]{1,32}$")]


@dataclass(frozen=True, slots=True)
class WeatherHandlers:
    compose: ComposeWeather
    artifacts: GetWeatherArtifact
    weather: WeatherSource


def build_router(h: WeatherHandlers) -> APIRouter:
    router = APIRouter(prefix="/v1/weather", tags=["weather"])

    @router.get("/sections", response_model=list[SectionOut], response_model_by_alias=True)
    def sections() -> list[SectionOut]:
        return [section_out(k) for k in SECTIONS]

    @router.get("/grid", response_model=GridOut, response_model_by_alias=True)
    async def grid() -> GridOut:
        return grid_out(await run_in_threadpool(h.weather.current))

    @router.get("/readings", response_model=ReadingsOut, response_model_by_alias=True)
    def readings() -> ReadingsOut:
        return readings_out(h.weather.readings())

    @router.get("/composer")
    def composer() -> dict[str, bool]:
        return {"aiAvailable": h.compose.ai_available}

    @router.post("/soundscapes", response_model=WeatherSoundscapeOut, response_model_by_alias=True)
    async def compose(body: ComposeWeatherIn) -> WeatherSoundscapeOut:
        cmd = ComposeWeatherCommand(
            section=body.section,
            cycles=body.cycles,
            amplitude=body.amplitude,
            duration_sec=body.duration_sec,
            composer=body.composer,
        )
        soundscape = await run_in_threadpool(h.compose, cmd)
        return weather_out(soundscape, h.compose.ai_available)

    @router.get("/soundscapes/{soundscape_id}/stems/{key}.wav")
    def stem(soundscape_id: SoundscapeId, key: StemKey) -> Response:
        return _send(h.artifacts.stem(soundscape_id, key))

    @router.get("/soundscapes/{soundscape_id}/mix.wav")
    def mix(
        soundscape_id: SoundscapeId,
        parts: Annotated[str | None, Query(max_length=120)] = None,
        mono: bool = False,
    ) -> Response:
        return _send(h.artifacts.mix(soundscape_id, parts, mono))

    return router

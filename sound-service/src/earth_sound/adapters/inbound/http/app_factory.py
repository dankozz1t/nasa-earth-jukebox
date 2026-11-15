from fastapi import FastAPI

from earth_sound import __version__
from earth_sound.adapters.inbound.http.errors import install_error_handlers
from earth_sound.adapters.inbound.http.routers import health, soundscapes, weather
from earth_sound.adapters.inbound.http.routers.soundscapes import SoundscapeHandlers
from earth_sound.adapters.inbound.http.routers.weather import WeatherHandlers


def create_app(handlers: SoundscapeHandlers, weather_handlers: WeatherHandlers) -> FastAPI:
    # Internal service, only the C# backend calls it: no CORS or auth.
    app = FastAPI(
        title="Earth Jukebox sound service",
        version=__version__,
        description="Turns NASA aerosol frames and live weather into scores, audio stems and MIDI.",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    install_error_handlers(app)
    app.include_router(health.build_router())
    app.include_router(soundscapes.build_router(handlers))
    app.include_router(weather.build_router(weather_handlers))
    return app

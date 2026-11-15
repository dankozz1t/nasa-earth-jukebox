from fastapi import FastAPI

from earth_sound.adapters.inbound.http.app_factory import create_app
from earth_sound.adapters.inbound.http.routers.soundscapes import SoundscapeHandlers
from earth_sound.adapters.inbound.http.routers.weather import WeatherHandlers
from earth_sound.adapters.outbound.ai.factory import build_ai_composer
from earth_sound.adapters.outbound.audio.wav import WavEncoder
from earth_sound.adapters.outbound.imaging.pillow import PillowImageDecoder, PngClassMapEncoder
from earth_sound.adapters.outbound.midi.mido_encoder import MidoMidiEncoder
from earth_sound.adapters.outbound.store.memory import MemorySoundscapeStore, MemoryStore
from earth_sound.adapters.outbound.weather.open_meteo import OpenMeteoWeatherSource
from earth_sound.application.compose_soundscape.use_case import ComposeSoundscape
from earth_sound.application.compose_weather.use_case import ComposeWeather
from earth_sound.application.get_artifact.use_case import GetArtifact
from earth_sound.application.get_artifact.weather import GetWeatherArtifact
from earth_sound.application.models.weather import WeatherSoundscape
from earth_sound.application.ports.composer import AiComposer, WeatherSource
from earth_sound.bootstrap.settings import Settings
from earth_sound.domain.aerosols.segmentation import SegmentationSettings
from earth_sound.domain.sound.synth import SynthSettings


def build_app(
    settings: Settings | None = None,
    weather: WeatherSource | None = None,
    composer: AiComposer | None = None,
) -> FastAPI:
    """`weather` and `composer` can be replaced; tests pass fakes."""
    settings = settings or Settings()
    store = MemorySoundscapeStore(settings.cache_size)
    compose = ComposeSoundscape(
        decoder=PillowImageDecoder(),
        store=store,
        segmentation=SegmentationSettings(bins=settings.bins),
        synth=SynthSettings(sample_rate=settings.sample_rate),
        max_width=settings.max_image_width,
    )
    artifacts = GetArtifact(store, WavEncoder(), MidoMidiEncoder(), PngClassMapEncoder())
    if weather is None:
        live = OpenMeteoWeatherSource(
            step_deg=settings.weather_grid_step, ttl_sec=settings.weather_ttl_sec, offline=settings.weather_offline
        )
        live.warm_up()  # starts the first fetch in the background
        weather = live
    weather_source = weather
    ai = composer or build_ai_composer(settings.ai_config())
    weather_store: MemoryStore[WeatherSoundscape] = MemoryStore(settings.weather_cache_size)
    weather_handlers = WeatherHandlers(
        compose=ComposeWeather(weather_source, ai, weather_store, settings.sample_rate),
        artifacts=GetWeatherArtifact(weather_store, WavEncoder()),
        weather=weather_source,
    )
    return create_app(
        SoundscapeHandlers(
            compose=compose,
            artifacts=artifacts,
            max_upload_bytes=settings.max_upload_mb * 1024 * 1024,
        ),
        weather_handlers,
    )

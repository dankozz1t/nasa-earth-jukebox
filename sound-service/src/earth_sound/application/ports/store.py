from typing import Protocol

from earth_sound.application.models.soundscape import Soundscape
from earth_sound.application.models.weather import WeatherSoundscape


class SoundscapeStore(Protocol):
    def get(self, soundscape_id: str) -> Soundscape | None: ...

    def put(self, soundscape: Soundscape) -> None: ...


class WeatherStore(Protocol):
    def get(self, soundscape_id: str) -> WeatherSoundscape | None: ...

    def put(self, soundscape: WeatherSoundscape) -> None: ...

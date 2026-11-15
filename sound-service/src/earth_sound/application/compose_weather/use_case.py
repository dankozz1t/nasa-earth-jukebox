"""Weather grid -> sine path -> per-bar features -> score plan (AI or rules) -> arrangement -> stems and stereo mix."""

import hashlib
import logging
from dataclasses import asdict

import numpy as np

from earth_sound.application.models.weather import ComposeWeatherCommand, WeatherSoundscape
from earth_sound.application.ports.composer import AiComposer, ComposerError, ComposerRequest, WeatherSource
from earth_sound.application.ports.store import WeatherStore
from earth_sound.domain.sound.aerosol_engine import compose_aerosol
from earth_sound.domain.sound.weather_mix import WeatherAudio, render_weather
from earth_sound.domain.weather.arrange import Arrangement, arrange, bars_for
from earth_sound.domain.weather.path import BarFeatures, SinePath, bar_features, path_samples
from earth_sound.domain.weather.plan import ScorePlan, compose_algorithmic, sanitize_plan
from earth_sound.domain.weather.sections import SECTIONS, Section
from earth_sound.shared.errors import InvalidInputError

logger = logging.getLogger(__name__)

TONIC_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
COMPOSERS = ("auto", "ai", "algorithmic", "aerosol")
PATH_POINTS = 512


class ComposeWeather:
    def __init__(self, weather: WeatherSource, composer: AiComposer, store: WeatherStore, sample_rate: int) -> None:
        self._weather = weather
        self._ai = composer
        self._store = store
        self._sr = sample_rate

    @property
    def ai_available(self) -> bool:
        return self._ai.available

    def __call__(self, cmd: ComposeWeatherCommand) -> WeatherSoundscape:
        section = SECTIONS.get(cmd.section)
        if section is None:
            raise InvalidInputError(f"unknown section: {cmd.section}; use one of {', '.join(SECTIONS)}")
        if not 0.5 <= cmd.cycles <= 12:
            raise InvalidInputError("cycles must be between 0.5 and 12")
        if not 0.1 <= cmd.amplitude <= 1:
            raise InvalidInputError("amplitude must be between 0.1 and 1")
        if not 20 <= cmd.duration_sec <= 180:
            raise InvalidInputError("duration_sec must be between 20 and 180")
        if cmd.composer not in COMPOSERS:
            raise InvalidInputError(f"composer must be one of {', '.join(COMPOSERS)}")

        grid = self._weather.current()
        key = "|".join(
            (
                grid.observed_at,
                cmd.section,
                f"{cmd.cycles:.2f}",
                f"{cmd.amplitude:.2f}",
                f"{cmd.duration_sec:.0f}",
                cmd.composer,
                str(self._ai.available),
            )
        )
        soundscape_id = hashlib.sha256(key.encode()).hexdigest()[:16]
        cached = self._store.get(soundscape_id)
        if cached is not None:
            return cached

        warnings = list(grid.notes)
        path = SinePath(cycles=cmd.cycles, amplitude=cmd.amplitude)
        bars = bars_for(cmd.duration_sec, section.tempo_bpm)
        features = bar_features(grid, section, path, bars)
        samples = path_samples(grid, section, path, PATH_POINTS)

        if cmd.composer == "aerosol":
            # skips the score plan and ensemble, uses the aerosol engine
            piece = compose_aerosol((samples["t"], samples["level"]), features, section, path, self._sr)
            plan, arrangement, audio = piece.plan, piece.arrangement, piece.audio
        else:
            plan, arrangement, audio = self._ensemble(cmd, grid.observed_at, section, path, features, samples, warnings)

        soundscape = WeatherSoundscape(
            id=soundscape_id,
            section=section,
            path=path,
            observed_at=grid.observed_at,
            source=grid.source,
            is_snapshot=grid.is_snapshot,
            features=tuple(features),
            plan=plan,
            arrangement=arrangement,
            audio=audio,
            samples=samples,
            composer_requested=cmd.composer,
            warnings=tuple(warnings),
        )
        self._store.put(soundscape)
        logger.info("weather soundscape %s: %s, %d bars, composer=%s", soundscape_id, section.key, bars, plan.composer)
        return soundscape

    def _ensemble(
        self,
        cmd: ComposeWeatherCommand,
        observed_at: str,
        section: Section,
        path: SinePath,
        features: list[BarFeatures],
        samples: dict[str, np.ndarray],
        warnings: list[str],
    ) -> tuple[ScorePlan, Arrangement, WeatherAudio]:
        bars = len(features)
        plan: ScorePlan | None = None
        if cmd.composer in ("auto", "ai") and self._ai.available:
            request = ComposerRequest(
                section=section.label,
                unit=section.unit,
                mood=section.mood,
                tonic_name=TONIC_NAMES[section.tonic],
                tempo_bpm=section.tempo_bpm,
                bars=bars,
                observed_at=observed_at,
                features=[asdict(f) for f in features],
            )
            try:
                plan = sanitize_plan(self._ai.compose(request), bars, self._ai.name)
                if plan.notes:
                    warnings.append(f"AI score was repaired: {'; '.join(plan.notes[:3])}")
            except ComposerError as exc:
                warnings.append(f"{exc.message} Used the algorithmic composer instead.")
        elif cmd.composer == "ai":
            warnings.append("AI composer is not configured on the server. Used the algorithmic composer instead.")
        if plan is None:
            plan = compose_algorithmic(features, section)

        arrangement = arrange(plan, features, section, section.tempo_bpm)
        audio = render_weather(
            arrangement,
            path,
            (samples["t"], samples["level"]),
            section.texture,
            sr=self._sr,
        )
        return plan, arrangement, audio

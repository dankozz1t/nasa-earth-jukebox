from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from earth_sound.adapters.outbound.ai.factory import AiConfig


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ES_", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    max_upload_mb: int = Field(default=25, ge=1, le=100)
    max_image_width: int = Field(default=1920, ge=256, le=4096)
    cache_size: int = Field(default=8, ge=1, le=128)
    max_parallel_renders: int = Field(default=2, ge=1, le=16)  # each render holds its audio in memory
    sample_rate: int = Field(default=22_050, ge=8_000, le=48_000)
    bins: int = Field(default=128, ge=16, le=512)

    weather_grid_step: float = Field(default=10.0, ge=5.0, le=30.0)
    weather_ttl_sec: int = Field(default=1800, ge=60, le=86_400)
    weather_offline: bool = False  # bundled snapshot only, for demos without internet
    weather_cache_size: int = Field(default=6, ge=1, le=64)

    # "auto" tries Anthropic, then OpenRouter. Anthropic also reads ANTHROPIC_AUTH_TOKEN / ANTHROPIC_PROFILE.
    ai_enabled: bool = True
    ai_provider: Literal["auto", "anthropic", "openrouter"] = "auto"
    ai_model: str = ""  # empty means the provider default
    ai_effort: str = "low"
    ai_timeout_sec: float = Field(default=90.0, ge=5, le=600)
    ai_daily_limit: int = Field(default=100, ge=0, le=10_000)
    anthropic_api_key: SecretStr | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    openrouter_api_key: SecretStr | None = Field(default=None, validation_alias="OPENROUTER_API_KEY")

    def ai_config(self) -> AiConfig:
        return AiConfig(
            enabled=self.ai_enabled,
            provider=self.ai_provider,
            model=self.ai_model or None,
            effort=self.ai_effort,
            timeout_sec=self.ai_timeout_sec,
            daily_limit=self.ai_daily_limit,
            anthropic_api_key=_secret(self.anthropic_api_key),
            openrouter_api_key=_secret(self.openrouter_api_key),
        )


def _secret(value: SecretStr | None) -> str | None:
    # compose passes `KEY=` when unset, treat that as no key
    return (value.get_secret_value().strip() or None) if value else None

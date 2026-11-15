"""Pick the AI provider from config and build the composer."""

import logging
from dataclasses import dataclass
from typing import Literal

from earth_sound.adapters.outbound.ai import anthropic_transport, openrouter_transport
from earth_sound.adapters.outbound.ai.anthropic_transport import AnthropicTransport
from earth_sound.adapters.outbound.ai.budget import BudgetedComposer
from earth_sound.adapters.outbound.ai.disabled import DisabledComposer
from earth_sound.adapters.outbound.ai.llm_composer import LlmComposer
from earth_sound.adapters.outbound.ai.openrouter_transport import OpenRouterTransport
from earth_sound.adapters.outbound.ai.transport import LlmTransport
from earth_sound.application.ports.composer import AiComposer

logger = logging.getLogger(__name__)

Provider = Literal["anthropic", "openrouter"]
ProviderChoice = Literal["auto", "anthropic", "openrouter"]

DEFAULT_MODELS: dict[Provider, str] = {
    "anthropic": anthropic_transport.DEFAULT_MODEL,
    "openrouter": openrouter_transport.DEFAULT_MODEL,
}


@dataclass(frozen=True, slots=True)
class AiConfig:
    enabled: bool = True
    provider: ProviderChoice = "auto"  # auto: Anthropic first, then OpenRouter
    model: str | None = None  # None or "": the chosen provider's default
    effort: str = "low"
    timeout_sec: float = 90.0
    daily_limit: int = 100  # paid calls per UTC day, cache hits are free
    anthropic_api_key: str | None = None
    openrouter_api_key: str | None = None


def resolve_provider(config: AiConfig) -> Provider | None:
    anthropic_ready = anthropic_transport.has_credentials(config.anthropic_api_key)
    openrouter_ready = bool(config.openrouter_api_key)
    if config.provider == "anthropic":
        return "anthropic" if anthropic_ready else None
    if config.provider == "openrouter":
        return "openrouter" if openrouter_ready else None
    if anthropic_ready:
        return "anthropic"
    return "openrouter" if openrouter_ready else None


def build_ai_composer(config: AiConfig) -> AiComposer:
    if not config.enabled:
        return DisabledComposer()
    provider = resolve_provider(config)
    if provider is None:
        logger.info("AI composer off: no credentials for provider %r", config.provider)
        return DisabledComposer("AI composer is not configured (no credentials).")
    model = config.model or DEFAULT_MODELS[provider]
    try:
        transport = _transport(provider, model, config)
    except Exception as exc:  # a client that cannot be built must not take the service down
        logger.warning("AI composer off: %s client failed to start: %s", provider, exc)
        return DisabledComposer(f"AI composer ({provider}) could not start.")
    logger.info("AI composer on: %s, model %s, %d calls a day", provider, model, config.daily_limit)
    return BudgetedComposer(LlmComposer(transport), config.daily_limit)


def _transport(provider: Provider, model: str, config: AiConfig) -> LlmTransport:
    if provider == "openrouter":
        assert config.openrouter_api_key  # guaranteed by resolve_provider
        return OpenRouterTransport(model, config.effort, config.timeout_sec, config.openrouter_api_key)
    return AnthropicTransport(model, config.effort, config.timeout_sec, config.anthropic_api_key)

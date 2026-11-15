"""Anthropic Messages API via the official SDK."""

import os
from pathlib import Path
from typing import cast

import anthropic
from anthropic.types.beta import BetaJSONOutputFormatParam, BetaMessageParam, BetaOutputConfigParam

from earth_sound.adapters.outbound.ai.transport import (
    Completion,
    CompletionRequest,
    Stop,
    connection_error,
    status_error,
)
from earth_sound.application.ports.composer import ComposerError

PROVIDER = "anthropic"
DEFAULT_MODEL = "claude-opus-5-5"
_ENV_CREDENTIALS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "ANTHROPIC_FEDERATION_RULE_ID")


def has_credentials(api_key: str | None) -> bool:
    # The SDK builds a client without credentials, so check up front for the "AI off" state.
    if api_key or any(os.environ.get(name) for name in _ENV_CREDENTIALS):
        return True
    config = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "anthropic"
    return config.is_dir() and any(config.iterdir())  # an `ant auth login` profile


class AnthropicTransport:
    provider = PROVIDER

    def __init__(self, model: str, effort: str, timeout_sec: float, api_key: str | None = None) -> None:
        self.model = model
        self._effort = effort
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout_sec, max_retries=1)

    def complete(self, request: CompletionRequest) -> Completion:
        output_format: BetaJSONOutputFormatParam = {"type": "json_schema", "schema": request.schema}
        output_config = cast(BetaOutputConfigParam, {"effort": self._effort, "format": output_format})
        messages: list[BetaMessageParam] = [{"role": "user", "content": request.user}]
        try:
            response = self._client.beta.messages.create(
                model=self.model,
                max_tokens=request.max_tokens,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=request.system,
                output_config=output_config,
                messages=messages,
            )
        except anthropic.APIStatusError as exc:
            raise status_error(PROVIDER, exc.status_code) from exc
        except anthropic.APIConnectionError as exc:
            raise connection_error(PROVIDER) from exc
        except anthropic.AnthropicError as exc:  # credentials that could not be resolved
            raise ComposerError(f"AI composer ({PROVIDER}) is not available.") from exc

        stop: Stop = "end"
        if response.stop_reason == "refusal":
            stop = "refusal"
        elif response.stop_reason == "max_tokens":
            stop = "max_tokens"
        text = next((b.text for b in response.content if b.type == "text"), "")
        return Completion(text=text, stop=stop, request_id=getattr(response, "_request_id", None))

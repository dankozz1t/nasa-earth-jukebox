"""OpenRouter chat completions (OpenAI-compatible)."""

from typing import Any

import httpx

from earth_sound.adapters.outbound.ai.transport import (
    Completion,
    CompletionRequest,
    Stop,
    connection_error,
    status_error,
)
from earth_sound.application.ports.composer import ComposerError

PROVIDER = "openrouter"
DEFAULT_MODEL = "anthropic/claude-haiku-5.5"
BASE_URL = "https://openrouter.ai/api/v1"
APP_TITLE = "Earth Jukebox"


class OpenRouterTransport:
    provider = PROVIDER

    def __init__(
        self,
        model: str,
        effort: str,
        timeout_sec: float,
        api_key: str,
        http: httpx.Client | None = None,  # tests pass a MockTransport client
    ) -> None:
        self.model = model
        self._effort = effort
        self._http = http or httpx.Client(base_url=BASE_URL, timeout=timeout_sec)
        self._headers = {"Authorization": f"Bearer {api_key}", "X-Title": APP_TITLE}

    def complete(self, request: CompletionRequest) -> Completion:
        body = {
            "model": self.model,
            "max_tokens": request.max_tokens,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.user},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": request.schema_name, "strict": True, "schema": request.schema},
            },
            "reasoning": {"effort": self._effort, "exclude": True},
            # only route to upstreams that support response_format, so the schema is enforced
            "provider": {"require_parameters": True},
        }
        try:
            response = self._http.post("/chat/completions", json=body, headers=self._headers)
        except httpx.TransportError as exc:
            raise connection_error(PROVIDER) from exc
        if response.is_error:
            raise status_error(PROVIDER, response.status_code)
        try:
            data: dict[str, Any] = response.json()
        except ValueError as exc:
            raise ComposerError(f"AI composer ({PROVIDER}) returned an unreadable response.") from exc
        if isinstance(data.get("error"), dict):  # an upstream failure can arrive with HTTP 200
            code = data["error"].get("code")
            raise status_error(PROVIDER, code if isinstance(code, int) else 502)
        return _completion(data)


def _completion(data: dict[str, Any]) -> Completion:
    try:
        choice = data["choices"][0]
        message = choice["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ComposerError(f"AI composer ({PROVIDER}) returned an unexpected shape.") from exc
    finish = choice.get("finish_reason") or choice.get("native_finish_reason")
    stop: Stop = "end"
    if message.get("refusal") or finish in ("refusal", "content_filter"):
        stop = "refusal"
    elif finish in ("length", "max_tokens"):
        stop = "max_tokens"
    content = message.get("content")
    text = content if isinstance(content, str) else ""
    return Completion(text=text, stop=stop, request_id=data.get("id"))

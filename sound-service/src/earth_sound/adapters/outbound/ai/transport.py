"""Provider-neutral request/reply types and error mapping for LLM transports."""

from dataclasses import dataclass
from typing import Any, Literal, Protocol

from earth_sound.application.ports.composer import ComposerError

Stop = Literal["end", "refusal", "max_tokens"]


@dataclass(frozen=True, slots=True)
class CompletionRequest:
    system: str
    user: str
    schema: dict[str, Any]  # JSON Schema the reply must follow
    schema_name: str
    max_tokens: int


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    stop: Stop
    request_id: str | None = None


class LlmTransport(Protocol):
    @property
    def provider(self) -> str: ...

    @property
    def model(self) -> str: ...

    def complete(self, request: CompletionRequest) -> Completion:
        """Raises ComposerError on any failure."""
        ...


def status_error(provider: str, status: int) -> ComposerError:
    if status in (401, 403):
        return ComposerError(f"AI composer ({provider}): the credentials were rejected.")
    if status == 402:
        return ComposerError(f"AI composer ({provider}): not enough credits on the account.")
    if status == 429:
        return ComposerError(f"AI composer ({provider}) is rate limited; try again shortly.")
    return ComposerError(f"AI composer ({provider}) error ({status}).")


def connection_error(provider: str) -> ComposerError:
    return ComposerError(f"AI composer ({provider}) could not be reached.")

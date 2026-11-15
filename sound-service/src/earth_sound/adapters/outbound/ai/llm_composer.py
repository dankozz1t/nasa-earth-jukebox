"""AI composer. The model only returns a JSON score plan (SCHEMA); sanitize_plan fixes it up and we render the sound."""

import json
import logging
from typing import Any

from earth_sound.adapters.outbound.ai.prompt import SCHEMA, SCHEMA_NAME, SYSTEM, user_message
from earth_sound.adapters.outbound.ai.transport import CompletionRequest, LlmTransport
from earth_sound.application.ports.composer import ComposerError, ComposerRequest

logger = logging.getLogger(__name__)

MAX_TOKENS = 16_000


class LlmComposer:
    def __init__(self, transport: LlmTransport) -> None:
        self._transport = transport

    @property
    def available(self) -> bool:
        return True

    @property
    def name(self) -> str:
        return f"ai:{self._transport.model}"

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        completion = self._transport.complete(
            CompletionRequest(
                system=SYSTEM,
                user=user_message(request),
                schema=SCHEMA,
                schema_name=SCHEMA_NAME,
                max_tokens=MAX_TOKENS,
            )
        )
        if completion.stop == "refusal":
            raise ComposerError("AI composer declined this request.")
        if completion.stop == "max_tokens":
            raise ComposerError("AI composer ran out of room before finishing the score.")
        try:
            data = json.loads(completion.text)
        except json.JSONDecodeError as exc:
            raise ComposerError("AI composer returned invalid JSON.") from exc
        if not isinstance(data, dict):
            raise ComposerError("AI composer returned an unexpected shape.")
        logger.info(
            "AI composed %d bars via %s (request %s)",
            len(data.get("bars", [])),
            self._transport.provider,
            completion.request_id or "?",
        )
        return data

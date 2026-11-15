from typing import Any

from earth_sound.application.ports.composer import ComposerError, ComposerRequest


class DisabledComposer:
    available = False
    name = "ai:disabled"

    def __init__(self, reason: str = "AI composer is disabled on this server.") -> None:
        self._reason = reason

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        raise ComposerError(self._reason)

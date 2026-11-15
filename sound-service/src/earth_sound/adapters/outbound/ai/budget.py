import threading
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from earth_sound.application.ports.composer import AiComposer, ComposerError, ComposerRequest


def _today() -> date:
    return datetime.now(UTC).date()


class BudgetedComposer:
    """Caps paid AI calls per UTC day. Past the cap the caller falls back to the rules until midnight UTC."""

    def __init__(self, inner: AiComposer, daily_limit: int, today: Callable[[], date] = _today) -> None:
        self._inner = inner
        self._limit = daily_limit
        self._today = today
        self._lock = threading.Lock()
        self._day = today()
        self._used = 0

    @property
    def available(self) -> bool:
        return self._inner.available

    @property
    def name(self) -> str:
        return self._inner.name

    def compose(self, request: ComposerRequest) -> dict[str, Any]:
        with self._lock:
            day = self._today()
            if day != self._day:
                self._day, self._used = day, 0
            if self._used >= self._limit:
                raise ComposerError("Daily AI budget on this server is spent.")
            self._used += 1  # failed calls count too, the provider may still bill them
        return self._inner.compose(request)

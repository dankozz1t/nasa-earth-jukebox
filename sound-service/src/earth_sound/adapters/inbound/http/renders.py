"""Composing holds whole audio arrays in memory, so run only a few renders at a time and queue the rest.

Without a gate a burst of requests renders in parallel and a small container runs out of memory.
"""

from collections.abc import Callable
from typing import TypeVar

import anyio
import anyio.to_thread

A = TypeVar("A")
R = TypeVar("R")


class RenderGate:
    def __init__(self, parallel: int) -> None:
        self._parallel = parallel
        self._limiter: anyio.CapacityLimiter | None = None  # created inside the event loop

    async def run(self, fn: Callable[[A], R], arg: A) -> R:
        if self._limiter is None:
            self._limiter = anyio.CapacityLimiter(self._parallel)
        return await anyio.to_thread.run_sync(fn, arg, limiter=self._limiter)

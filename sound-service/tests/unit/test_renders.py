import threading
import time

import anyio

from earth_sound.adapters.inbound.http.renders import RenderGate


def test_gate_runs_at_most_n_renders_at_once() -> None:
    gate = RenderGate(parallel=2)
    lock = threading.Lock()
    running = 0
    peak = 0

    def render(value: int) -> int:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1
        return value * 2

    results: list[int] = []

    async def main() -> None:
        async def one(value: int) -> None:
            results.append(await gate.run(render, value))

        async with anyio.create_task_group() as tg:
            for value in range(6):
                tg.start_soon(one, value)

    anyio.run(main)

    assert peak == 2
    assert sorted(results) == [0, 2, 4, 6, 8, 10]

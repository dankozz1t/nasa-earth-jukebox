"""In-process LRU store. Soundscapes can be rebuilt from their inputs, so losing them on restart is fine."""

import threading
from collections import OrderedDict
from typing import Protocol


class _HasId(Protocol):
    @property
    def id(self) -> str: ...


class MemoryStore[T: _HasId]:
    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError("capacity must be at least 1")
        self._capacity = capacity
        self._items: OrderedDict[str, T] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, soundscape_id: str) -> T | None:
        with self._lock:
            item = self._items.get(soundscape_id)
            if item is not None:
                self._items.move_to_end(soundscape_id)
            return item

    def put(self, soundscape: T) -> None:
        with self._lock:
            self._items[soundscape.id] = soundscape
            self._items.move_to_end(soundscape.id)
            while len(self._items) > self._capacity:
                self._items.popitem(last=False)


MemorySoundscapeStore = MemoryStore

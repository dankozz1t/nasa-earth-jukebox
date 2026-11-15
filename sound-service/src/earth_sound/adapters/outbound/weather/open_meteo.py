"""Live weather grid from Open-Meteo. Falls back to the bundled snapshot.json.gz when there is no live data."""

import collections
import gzip
import json
import logging
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from earth_sound.domain.weather.grid import VARIABLES, WeatherGrid, regular_axes
from earth_sound.domain.weather.readings import Reading, summarize
from earth_sound.shared.errors import EarthSoundError

logger = logging.getLogger(__name__)

API = "https://api.open-meteo.com/v1/forecast"
FIELDS = {
    "temperature_2m": "temperature",
    "precipitation": "precipitation",
    "cloud_cover": "clouds",
    "wind_speed_10m": "wind",
}
SOURCE = "Open-Meteo.com (weather models of national services, CC BY 4.0)"
SNAPSHOT = Path(__file__).with_name("snapshot.json.gz")
BATCH = 120  # points per request
PAUSE_SEC = 1.5  # between batches, stays under the 600 calls/min limit
UPDATE_INTERVAL_SEC = 1800  # refresh on :00 and :30
BOUNDARY_LAG_SEC = 90  # Open-Meteo publishes a little after the boundary
HISTORY = 8  # readings kept, 8 x 30 min = 4 hours
SNAPSHOT_RETRY_SEC = 60  # when the UI should look again while the first fetch runs
BACKOFF_SEC = (60, 300)  # after a failed fetch: first wait, doubling up to the cap
UNCHANGED_RETRY_SEC = 120  # same observed_at as before: look again soon
UNCHANGED_RETRIES = 3  # at most this many times per update
DAILY_CALLS = 10_000  # Open-Meteo free tier, per UTC day
POINTS_PER_CALL = 10  # Open-Meteo counts every ~10 locations as one call
BUDGET_NOTE = "Daily weather budget used; next update after 00:00 UTC."
BUDGET_SHARE = 0.8  # margin for restarts, 429 retries and other users of the IP


class WeatherUnavailableError(EarthSoundError):
    code = "weather_unavailable"


def next_update(now: datetime, interval_sec: int = UPDATE_INTERVAL_SEC, lag_sec: int = BOUNDARY_LAG_SEC) -> datetime:
    """Next interval boundary after `now` (UTC), plus `lag_sec`."""
    seconds = now.hour * 3600 + now.minute * 60 + now.second
    floor = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
        seconds=seconds // interval_sec * interval_sec
    )
    return floor + timedelta(seconds=interval_sec + lag_sec)


def next_half_hour(now: datetime, lag_sec: int = BOUNDARY_LAG_SEC) -> datetime:
    return next_update(now, UPDATE_INTERVAL_SEC, lag_sec)


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_utc(text: str) -> datetime:
    # Open-Meteo times are GMT without a suffix, e.g. 2026-11-14T14:15.
    parsed = datetime.fromisoformat(text.strip().removesuffix("Z"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def grid_to_json(grid: WeatherGrid) -> dict[str, Any]:
    return {
        "lats": grid.lats.tolist(),
        "lons": grid.lons.tolist(),
        "observed_at": grid.observed_at,
        "source": grid.source,
        "values": {k: np.round(v, 2).tolist() for k, v in grid.values.items()},
    }


def grid_from_json(data: dict[str, Any], is_snapshot: bool, note: str | None = None) -> WeatherGrid:
    return WeatherGrid(
        lats=np.asarray(data["lats"], dtype=np.float64),
        lons=np.asarray(data["lons"], dtype=np.float64),
        values={k: np.asarray(v, dtype=np.float64) for k, v in data["values"].items()},
        observed_at=str(data["observed_at"]),
        source=str(data["source"]),
        is_snapshot=is_snapshot,
        notes=(note,) if note else (),
    )


class OpenMeteoWeatherSource:
    def __init__(
        self,
        step_deg: float = 10.0,
        ttl_sec: int = 1800,
        timeout_sec: float = 20.0,
        offline: bool = False,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._step = step_deg
        self._ttl = ttl_sec
        self._timeout = timeout_sec
        self._offline = offline
        self._now = now
        self._cached: WeatherGrid | None = None
        self._history: collections.deque[Reading] = collections.deque(maxlen=HISTORY)
        self._lock = threading.Lock()
        self._refreshing = False
        self._last_error: str | None = None
        self._rate_limited = False  # the last failure was a 429 (per-minute or daily limit)
        self._retry_after: datetime | None = None  # set after a failure
        self._backoff_sec = 0
        self._unchanged = 0  # early retries used in this update
        self._day = self._now().date()  # UTC day of _fetches_today
        self._fetches_today = 0  # only fetches that reached Open-Meteo
        self._reached = False  # did the running fetch get any answer from the API

    def warm_up(self) -> None:
        if not self._offline:
            self._start_refresh()

    def current(self) -> WeatherGrid:
        """Never waits for the network: fresh cache, else stale cache or snapshot while a refresh runs."""
        if self._offline:
            return self._snapshot("Offline mode: bundled snapshot.")
        with self._lock:
            cached = self._cached
        if cached is not None and self._is_fresh(cached):
            return cached
        self._start_refresh()
        blocked = self._budget_midnight() is not None
        if cached is not None:
            note = BUDGET_NOTE if blocked else "Refreshing live data in the background."
            fields = {**_fields(cached), "notes": (note,)}
            if (retry := self._retry_time()) is not None:  # a stable retry time while we back off
                fields["next_update_at"] = _iso(retry)
            return WeatherGrid(**fields)
        if blocked:
            return self._snapshot(f"{BUDGET_NOTE} Showing a recent bundled snapshot.")
        with self._lock:
            failed, rate_limited = self._last_error is not None, self._rate_limited
        if rate_limited:
            reason = "Open-Meteo rate limit reached"
        elif failed:
            reason = "Live weather failed to load"
        else:
            reason = "Live weather is still loading"
        return self._snapshot(f"{reason}; showing a recent bundled snapshot.")

    def readings(self) -> list[Reading]:
        with self._lock:
            history = list(self._history)
        return history or [summarize(self._snapshot("No live reading yet."))]

    def _is_fresh(self, grid: WeatherGrid) -> bool:
        if grid.next_update_at is None or grid.fetched_at is None:
            return False
        now = self._now()
        return (
            now < _parse_utc(grid.next_update_at)
            and (now - _parse_utc(grid.fetched_at)).total_seconds() < self._ttl + BOUNDARY_LAG_SEC
        )

    def _retry_time(self) -> datetime | None:
        if (midnight := self._budget_midnight()) is not None:  # budget spent: nothing before 00:00 UTC
            return midnight
        with self._lock:
            retry = self._retry_after
        if retry is None:
            return None
        now = self._now()  # window elapsed, retry in flight: ask again in a minute
        return retry if retry > now else now + timedelta(seconds=SNAPSHOT_RETRY_SEC)

    def _start_refresh(self) -> None:
        with self._lock:
            retry = self._retry_after
            now = self._now()
            if self._refreshing or (retry is not None and now < retry):
                return
            if self._budget_spent(now):
                return
            self._refreshing = True
        threading.Thread(target=self._refresh, name="open-meteo-refresh", daemon=True).start()

    def daily_budget(self) -> int:
        """Whole-grid fetches per UTC day that fit the free tier, with a margin."""
        lats, lons = regular_axes(self._step)
        calls = math.ceil(len(lats) * len(lons) / POINTS_PER_CALL)
        return int(DAILY_CALLS * BUDGET_SHARE) // max(1, calls)

    def _budget_spent(self, now: datetime) -> bool:
        """Caller holds the lock."""
        used = self._fetches_today if now.date() == self._day else 0
        return used >= self.daily_budget()

    def _budget_midnight(self) -> datetime | None:
        now = self._now()
        with self._lock:
            if not self._budget_spent(now):
                return None
        return datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    def _count_fetch(self) -> None:
        with self._lock:
            today = self._now().date()
            if today != self._day:
                self._day, self._fetches_today = today, 0
            self._fetches_today += 1

    def _spare_budget(self, now: datetime) -> bool:
        """An early retry must leave room for every regular update still due today."""
        midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        updates_left = math.ceil((midnight - now).total_seconds() / UPDATE_INTERVAL_SEC)
        return self._fetches_today + 1 + updates_left <= self.daily_budget()

    def _refresh(self) -> None:
        self._reached = False
        counted = False
        try:
            grid = self._fetch()
            self._count_fetch()
            counted = True
            fetched = self._now()
            with self._lock:
                unchanged = self._cached is not None and self._cached.observed_at == grid.observed_at
                early = unchanged and self._unchanged < UNCHANGED_RETRIES and self._spare_budget(fetched)
                if early:  # new reading not published yet
                    self._unchanged += 1
                    due = fetched + timedelta(seconds=UNCHANGED_RETRY_SEC)
                else:
                    self._unchanged = 0
                    due = next_half_hour(fetched)
                self._cached = replace(grid, fetched_at=_iso(fetched), next_update_at=_iso(due))
                if not self._history or self._history[-1].observed_at != grid.observed_at:
                    self._history.append(summarize(grid))
                self._last_error = None
                self._rate_limited = False
                self._retry_after = None
                self._backoff_sec = 0
            logger.info("live weather updated: %s", grid.observed_at)
        except Exception as exc:  # anything (IncompleteRead, TypeError, ...) must back off, not kill the thread
            logger.warning("Open-Meteo fetch failed: %r", exc)
            if self._reached and not counted:  # failures before any answer (DNS, refused, connect timeout) are free
                self._count_fetch()
            with self._lock:
                self._last_error = f"{type(exc).__name__}: {exc}"
                self._rate_limited = isinstance(exc, urllib.error.HTTPError) and exc.code == 429
                self._backoff_sec = min(self._backoff_sec * 2, BACKOFF_SEC[1]) or BACKOFF_SEC[0]
                self._retry_after = self._now() + timedelta(seconds=self._backoff_sec)
        finally:
            with self._lock:
                self._refreshing = False

    def _snapshot(self, note: str) -> WeatherGrid:
        try:
            with gzip.open(SNAPSHOT, "rt", encoding="utf-8") as f:
                grid = grid_from_json(json.load(f), is_snapshot=True, note=note)
            now = self._now()
            retry = self._retry_time() or now + timedelta(seconds=SNAPSHOT_RETRY_SEC)
            return replace(grid, fetched_at=_iso(now), next_update_at=_iso(retry))
        except OSError as exc:
            raise WeatherUnavailableError("Weather data is unavailable and no snapshot is bundled.") from exc

    def _fetch(self) -> WeatherGrid:
        lats, lons = regular_axes(self._step)
        points = [(float(la), float(lo)) for la in lats for lo in lons]
        batches = [points[i : i + BATCH] for i in range(0, len(points), BATCH)]
        rows: list[dict[str, Any]] = []
        for k, batch in enumerate(batches):  # sequential and paced for the free-tier limits
            if k:
                time.sleep(PAUSE_SEC)
            rows.extend(self._fetch_batch(batch))
        if len(rows) != len(points):
            raise ValueError(f"expected {len(points)} points, got {len(rows)}")
        values = {name: np.full((len(lats), len(lons)), np.nan) for name in VARIABLES}
        observed = ""
        for idx, row in enumerate(rows):
            i, j = divmod(idx, len(lons))
            current = row["current"]
            observed = max(observed, str(current.get("time", "")))
            interval_h = float(current.get("interval", 3600)) / 3600.0
            for api_name, name in FIELDS.items():
                v = current.get(api_name)
                if v is None:
                    continue
                values[name][i, j] = float(v) / interval_h if api_name == "precipitation" else float(v)
        for name, arr in values.items():
            if np.isnan(arr).any():  # fill a few missing points with the row mean
                means = np.nanmean(arr, axis=1, keepdims=True)
                values[name] = np.where(np.isnan(arr), np.nan_to_num(means), arr)
        return WeatherGrid(
            lats=lats, lons=lons, values=values, observed_at=f"{observed}Z" if observed else "", source=SOURCE
        )

    def _fetch_batch(self, batch: list[tuple[float, float]]) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode(
            {
                "latitude": ",".join(f"{la:.2f}" for la, _ in batch),
                "longitude": ",".join(f"{lo:.2f}" for _, lo in batch),
                "current": ",".join(FIELDS),
                "timezone": "GMT",
                "wind_speed_unit": "kmh",
            }
        )
        request = urllib.request.Request(
            f"{API}?{query}", headers={"User-Agent": "EarthJukebox/0.3 (NASA Space Apps prototype)"}
        )
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as response:
                    self._reached = True
                    data = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                self._reached = True
                if exc.code != 429 or attempt == 2:
                    raise
                wait = float(exc.headers.get("Retry-After") or 10 * (attempt + 1))
                logger.info("Open-Meteo rate limit, waiting %.0fs", wait)
                time.sleep(min(wait, 60))
            except urllib.error.URLError:
                raise  # never reached the server
            except Exception:
                self._reached = True  # the request went out: read timeout, cut connection, bad body
                raise
        rows = data if isinstance(data, list) else [data]
        return [r for r in rows if isinstance(r, dict) and "current" in r]


def _fields(grid: WeatherGrid) -> dict[str, Any]:
    return {
        "lats": grid.lats,
        "lons": grid.lons,
        "values": grid.values,
        "observed_at": grid.observed_at,
        "source": grid.source,
        "is_snapshot": grid.is_snapshot,
        "fetched_at": grid.fetched_at,
        "next_update_at": grid.next_update_at,
    }

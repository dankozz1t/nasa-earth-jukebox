import http.client
import threading
import time
import urllib.error
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from earth_sound.adapters.outbound.weather.open_meteo import OpenMeteoWeatherSource, next_half_hour, next_update
from earth_sound.bootstrap.settings import Settings
from tests.fakes.weather import synthetic_grid


class Clock:
    def __init__(self, start: datetime) -> None:
        self.t = start

    def __call__(self) -> datetime:
        return self.t


T0 = datetime(2026, 11, 14, 14, 16, 10, tzinfo=UTC)


def fetching(monkeypatch: pytest.MonkeyPatch, observed: list[str]) -> list[int]:
    """Replace the network fetch: each call yields the next observed_at. Returns the call counter."""
    calls: list[int] = []

    def fetch(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        calls.append(1)
        return replace(synthetic_grid(), observed_at=observed[min(len(calls), len(observed)) - 1])

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", fetch)
    return calls


def refresh_now(src: OpenMeteoWeatherSource) -> None:
    src._refreshing = True
    src._refresh()


def test_serves_snapshot_while_loading_then_live(monkeypatch: pytest.MonkeyPatch) -> None:
    release = threading.Event()

    def slow_fetch(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        release.wait(5)
        return synthetic_grid()

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", slow_fetch)
    src = OpenMeteoWeatherSource(ttl_sec=60)
    first = src.current()
    assert first.is_snapshot
    assert "still loading" in first.notes[0]
    release.set()
    for _ in range(50):
        if not src.current().is_snapshot:
            break
        time.sleep(0.05)
    live = src.current()
    assert not live.is_snapshot
    assert live.source == "synthetic"


def test_failure_keeps_snapshot_with_a_note(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        raise OSError("network down")

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", broken)
    src = OpenMeteoWeatherSource()
    src.warm_up()
    time.sleep(0.2)
    grid = src.current()
    assert grid.is_snapshot
    assert "failed" in grid.notes[0]


def test_rate_limit_says_so_and_other_failures_keep_their_note(monkeypatch: pytest.MonkeyPatch) -> None:
    error: Exception = urllib.error.HTTPError(
        "https://api.open-meteo.com/v1/forecast", 429, "Too Many Requests", http.client.HTTPMessage(), None
    )

    def failing(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        raise error

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", failing)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)
    assert src.current().notes == ("Open-Meteo rate limit reached; showing a recent bundled snapshot.",)

    error = OSError("network down")
    clock.t = T0 + timedelta(hours=1)  # past the backoff window
    refresh_now(src)
    assert src.current().notes == ("Live weather failed to load; showing a recent bundled snapshot.",)


def test_offline_mode_uses_the_snapshot_only() -> None:
    grid = OpenMeteoWeatherSource(offline=True).current()
    assert grid.is_snapshot
    assert grid.values["temperature"].shape == (18, 36)


def test_next_half_hour_rounds_up_with_lag() -> None:
    assert next_half_hour(T0) == datetime(2026, 11, 14, 14, 31, 30, tzinfo=UTC)
    assert next_half_hour(datetime(2026, 11, 14, 14, 31, 0, tzinfo=UTC)) == datetime(
        2026, 11, 14, 15, 1, 30, tzinfo=UTC
    )


def test_next_half_hour_exactly_on_boundary() -> None:
    assert next_half_hour(datetime(2026, 11, 14, 14, 30, 0, tzinfo=UTC)) == datetime(
        2026, 11, 14, 15, 1, 30, tzinfo=UTC
    )
    assert next_half_hour(datetime(2026, 11, 14, 14, 0, 0, tzinfo=UTC)) == datetime(
        2026, 11, 14, 14, 31, 30, tzinfo=UTC
    )
    assert next_half_hour(datetime(2026, 11, 14, 14, 59, 59, tzinfo=UTC)) == datetime(
        2026, 11, 14, 15, 1, 30, tzinfo=UTC
    )


def test_next_half_hour_crosses_midnight() -> None:
    assert next_half_hour(datetime(2026, 11, 14, 23, 45, 0, tzinfo=UTC)) == datetime(2026, 11, 15, 0, 1, 30, tzinfo=UTC)


def test_next_update_can_use_another_interval() -> None:
    assert next_update(T0, 900) == datetime(2026, 11, 14, 14, 31, 30, tzinfo=UTC)
    assert next_update(datetime(2026, 11, 14, 14, 50, 0, tzinfo=UTC), 900) == datetime(
        2026, 11, 14, 15, 1, 30, tzinfo=UTC
    )


def test_default_ttl_is_30_minutes() -> None:
    assert Settings().weather_ttl_sec == 1800


def test_grid_exposes_fetched_and_next_update(monkeypatch: pytest.MonkeyPatch) -> None:
    fetching(monkeypatch, ["2026-11-14T14:15"])
    src = OpenMeteoWeatherSource(now=Clock(T0))
    refresh_now(src)
    grid = src.current()
    assert not grid.is_snapshot
    assert grid.fetched_at == "2026-11-14T14:16:10Z"
    assert grid.next_update_at == "2026-11-14T14:31:30Z"
    assert grid.next_update_at > grid.fetched_at


def test_snapshot_gets_a_retry_time() -> None:
    grid = OpenMeteoWeatherSource(offline=True, now=Clock(T0)).current()
    assert grid.is_snapshot
    assert grid.fetched_at == "2026-11-14T14:16:10Z"
    assert grid.next_update_at == "2026-11-14T14:17:10Z"


def test_freshness_follows_next_update_not_a_monotonic_timer(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = fetching(monkeypatch, ["2026-11-14T14:15", "2026-11-14T14:30"])
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)
    clock.t = datetime(2026, 11, 14, 14, 31, 29, tzinfo=UTC)  # one second before next_update_at
    assert "Refreshing" not in "".join(src.current().notes)
    assert len(calls) == 1
    clock.t = clock.t + timedelta(seconds=1)
    stale = src.current()
    assert stale.notes == ("Refreshing live data in the background.",)
    assert stale.next_update_at == "2026-11-14T14:31:30Z"  # the copy keeps its timestamps
    for _ in range(100):  # the background thread fetches the next reading
        if len(calls) == 2 and not src._refreshing:
            break
        time.sleep(0.02)
    assert src.current().observed_at == "2026-11-14T14:30"


def test_readings_keep_last_8_and_skip_duplicates(monkeypatch: pytest.MonkeyPatch) -> None:
    observed = [f"2026-11-14T{12 + i // 2:02d}:{i % 2 * 30:02d}" for i in range(10)]  # one every 30 minutes
    fetching(monkeypatch, observed)
    src = OpenMeteoWeatherSource(now=Clock(T0))
    for _ in range(10):
        refresh_now(src)
    history = src.readings()
    assert [r.observed_at for r in history] == observed[2:]  # the oldest two dropped, oldest first
    assert (history[0].observed_at, history[-1].observed_at) == ("2026-11-14T13:00", "2026-11-14T16:30")  # 4 h
    refresh_now(src)  # the source repeats the last observation: nothing new
    assert [r.observed_at for r in src.readings()] == observed[2:]


def test_readings_before_any_live_fetch_is_a_snapshot_summary() -> None:
    (reading,) = OpenMeteoWeatherSource(offline=True, now=Clock(T0)).readings()
    assert reading.is_snapshot


def wait_idle(src: OpenMeteoWeatherSource) -> None:
    for _ in range(200):
        if not src._refreshing:
            return
        time.sleep(0.01)
    raise AssertionError("refresh did not finish")


def test_failed_fetch_backs_off_then_retries_then_resets(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    outcome = {"fail": True}

    def fetch(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        calls.append(1)
        if outcome["fail"]:
            raise OSError("down")
        return replace(synthetic_grid(), observed_at="2026-11-14T14:15")

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", fetch)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    src.current()  # starts the first fetch
    wait_idle(src)
    assert len(calls) == 1
    retry = (T0 + timedelta(seconds=60)).strftime("%Y-%m-%dT%H:%M:%SZ")
    clock.t = T0 + timedelta(seconds=30)
    assert src.current().next_update_at == retry  # a stable retry time, not now + 60
    wait_idle(src)
    assert len(calls) == 1  # inside the window: no new fetch
    clock.t = T0 + timedelta(seconds=60)
    src.current()
    wait_idle(src)
    assert len(calls) == 2  # after the window: tried again, and failed again
    assert src._retry_after == clock.t + timedelta(seconds=120)  # backoff doubled
    for _ in range(4):  # the ceiling is 5 minutes
        clock.t = src._retry_after
        src.current()
        wait_idle(src)
    assert src._backoff_sec == 300
    outcome["fail"] = False
    clock.t = src._retry_after
    src.current()
    wait_idle(src)
    assert src._backoff_sec == 0
    assert src._retry_after is None
    assert not src.current().is_snapshot


def test_unchanged_observation_retries_early_at_most_three_times(monkeypatch: pytest.MonkeyPatch) -> None:
    fetching(monkeypatch, ["2026-11-14T14:15"] * 5 + ["2026-11-14T14:30"])  # first + 3 early + 1 give-up, then new
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)  # first reading
    assert src.current().next_update_at == "2026-11-14T14:31:30Z"
    clock.t = datetime(2026, 11, 14, 14, 31, 30, tzinfo=UTC)
    for _ in range(3):  # the new reading is not published yet: look again in 120 s
        refresh_now(src)
        assert src.current().next_update_at == (clock.t + timedelta(seconds=120)).strftime("%Y-%m-%dT%H:%M:%SZ")
        clock.t += timedelta(seconds=120)
    refresh_now(src)  # a fourth unchanged answer: give up until the next half hour
    assert src.current().next_update_at == "2026-11-14T15:01:30Z"
    assert [r.observed_at for r in src.readings()] == ["2026-11-14T14:15"]
    clock.t = datetime(2026, 11, 14, 15, 1, 30, tzinfo=UTC)
    refresh_now(src)  # a new observation: normal half-hour scheduling, appended once
    assert src.current().next_update_at == "2026-11-14T15:31:30Z"
    assert [r.observed_at for r in src.readings()] == ["2026-11-14T14:15", "2026-11-14T14:30"]


def test_retry_time_reported_to_clients_is_never_in_the_past(monkeypatch: pytest.MonkeyPatch) -> None:
    release = threading.Event()
    attempts = []

    def fetch(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        attempts.append(1)
        if len(attempts) == 1:
            raise OSError("down")
        release.wait(5)  # the retry stays in flight
        return synthetic_grid()

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", fetch)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    src.current()
    wait_idle(src)
    clock.t = T0 + timedelta(seconds=61)  # the backoff window is over; the retry starts and hangs
    src.current()
    assert src.current().next_update_at == "2026-11-14T14:18:11Z"  # now + 60 s, not the elapsed retry time
    release.set()
    wait_idle(src)


def test_daily_budget_fits_the_free_tier() -> None:
    src = OpenMeteoWeatherSource()  # 10 degree grid: 648 points, 65 calls per fetch
    assert src.daily_budget() == 8000 // 65
    assert src.daily_budget() * 65 <= 10_000
    assert src.daily_budget() > 48  # every regular half hour of the day fits, with room for early retries


def test_early_retries_stop_when_the_daily_budget_is_used_up(monkeypatch: pytest.MonkeyPatch) -> None:
    fetching(monkeypatch, ["2026-11-14T14:15"] * 3)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)  # first reading
    clock.t = datetime(2026, 11, 14, 14, 31, 30, tzinfo=UTC)
    # 19 half hours are left today (14:31:30 to midnight): the budget must keep one fetch for each of them.
    src._fetches_today = src.daily_budget() - 19 - 1
    refresh_now(src)  # unchanged, and this fetch uses the last spare one: no early retry
    assert src.current().next_update_at == "2026-11-14T15:01:30Z"


def test_early_retry_with_spare_budget_and_the_count_resets_each_utc_day(monkeypatch: pytest.MonkeyPatch) -> None:
    fetching(monkeypatch, ["2026-11-14T14:15"] * 3)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)
    clock.t = datetime(2026, 11, 14, 14, 31, 30, tzinfo=UTC)
    src._fetches_today = src.daily_budget() - 19 - 2
    refresh_now(src)  # one spare fetch left after this one: retry early
    assert src.current().next_update_at == "2026-11-14T14:33:30Z"
    assert src._fetches_today == src.daily_budget() - 19 - 1
    clock.t = datetime(2026, 11, 15, 0, 1, 0, tzinfo=UTC)
    refresh_now(src)
    assert src._fetches_today == 1


@pytest.mark.parametrize(
    "error", [http.client.IncompleteRead(b"partial"), TypeError("bad payload"), AttributeError("nope")]
)
def test_unexpected_fetch_errors_back_off_and_never_wedge_the_refresh(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    calls: list[int] = []
    outcome = {"fail": True}

    def fetch(self: OpenMeteoWeatherSource):  # type: ignore[no-untyped-def]
        calls.append(1)
        if outcome["fail"]:
            raise error
        return replace(synthetic_grid(), observed_at="2026-11-14T14:15")

    monkeypatch.setattr(OpenMeteoWeatherSource, "_fetch", fetch)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    src.current()
    wait_idle(src)
    assert len(calls) == 1
    assert src._refreshing is False
    assert src._backoff_sec == 60
    assert src._retry_after == T0 + timedelta(seconds=60)
    assert src._last_error is not None
    outcome["fail"] = False
    clock.t = src._retry_after
    src.current()  # a later call fetches again, and recovers
    wait_idle(src)
    assert len(calls) == 2
    assert not src.current().is_snapshot
    assert src._last_error is None


def test_no_fetch_starts_once_the_daily_budget_is_used_up(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = fetching(monkeypatch, ["2026-11-14T14:15"])
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    src._fetches_today = src.daily_budget()
    assert src.current().is_snapshot
    time.sleep(0.1)
    assert calls == []
    assert src._refreshing is False
    clock.t = datetime(2026, 11, 15, 0, 1, 0, tzinfo=UTC)  # a new UTC day: the count starts again
    src.current()
    wait_idle(src)
    assert len(calls) == 1


def net_failing(monkeypatch: pytest.MonkeyPatch, error: Exception) -> list[int]:
    """Run the real _fetch against an HTTP layer that always raises `error`."""
    calls: list[int] = []

    def urlopen(request, timeout=None):  # type: ignore[no-untyped-def]
        calls.append(1)
        raise error

    monkeypatch.setattr("earth_sound.adapters.outbound.weather.open_meteo.urllib.request.urlopen", urlopen)
    return calls


def test_failures_before_any_request_do_not_use_the_daily_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    refused = urllib.error.URLError(ConnectionRefusedError("refused"))
    calls = net_failing(monkeypatch, refused)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    for _ in range(120):  # an outage: every try is refused, retries at the 5 minute ceiling
        src.current()
        wait_idle(src)
        assert src._retry_after is not None
        clock.t = src._retry_after
    assert len(calls) == 120
    assert src._fetches_today == 0
    assert src._budget_midnight() is None
    monkeypatch.undo()
    fetching(monkeypatch, ["2026-11-14T14:15"])  # the service is back
    src.current()
    wait_idle(src)
    assert not src.current().is_snapshot
    assert src._fetches_today == 1


def test_calls_that_reach_open_meteo_hit_the_cap_and_block_with_a_future_next_update(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server_error = urllib.error.HTTPError("https://x", 500, "boom", {}, None)  # type: ignore[arg-type]
    calls = net_failing(monkeypatch, server_error)
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    src._fetches_today = src.daily_budget() - 1
    src.current()
    wait_idle(src)
    assert src._fetches_today == src.daily_budget()  # a real answer counts, even an error
    assert len(calls) == 1
    clock.t = src._retry_after  # type: ignore[assignment]
    grid = src.current()  # blocked: no new fetch, a bundled snapshot, a future next_update_at
    wait_idle(src)
    assert len(calls) == 1
    assert grid.is_snapshot
    assert "Daily weather budget used" in grid.notes[0]
    assert grid.next_update_at == "2026-11-15T00:00:00Z"
    assert grid.next_update_at > _iso_now(clock)


def test_blocked_by_the_budget_a_stale_live_grid_reports_midnight(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = fetching(monkeypatch, ["2026-11-14T14:15"])
    clock = Clock(T0)
    src = OpenMeteoWeatherSource(now=clock)
    refresh_now(src)
    src._fetches_today = src.daily_budget()
    clock.t = T0 + timedelta(hours=1)  # the live grid is stale now
    grid = src.current()
    wait_idle(src)
    assert len(calls) == 1
    assert not grid.is_snapshot
    assert grid.notes == ("Daily weather budget used; next update after 00:00 UTC.",)
    assert grid.next_update_at == "2026-11-15T00:00:00Z"


def _iso_now(clock: Clock) -> str:
    return clock.t.strftime("%Y-%m-%dT%H:%M:%SZ")

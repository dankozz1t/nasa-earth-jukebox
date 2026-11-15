import { describe, expect, it } from "vitest";
import { ApiError, readError } from "../src/shared/api/aerosols";
import { localizeWarning, nextRefetchMs } from "../src/shared/api/client";
import type { WeatherGrid } from "../src/shared/api/weather";
import { t } from "../src/shared/i18n";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const grid = (over: Partial<WeatherGrid>): WeatherGrid => ({
  lats: [],
  lons: [],
  observedAt: "2026-11-14T11:00:00Z",
  source: "test",
  isSnapshot: false,
  notes: [],
  values: { temperature: [], precipitation: [], clouds: [], wind: [] },
  ...over,
});

describe("nextRefetchMs", () => {
  it("waits until nextUpdateAt + 60 s", () => {
    const g = grid({ nextUpdateAt: new Date(NOW + 300_000).toISOString() });
    expect(nextRefetchMs(g, NOW)).toBe(360_000);
  });
  it("never goes below 60 s when nextUpdateAt is in the past", () => {
    const g = grid({ nextUpdateAt: new Date(NOW - 600_000).toISOString() });
    expect(nextRefetchMs(g, NOW)).toBe(60_000);
  });
  it("looks again after 15 s while the server refreshes in the background (old grid, update time passed)", () => {
    const past = new Date(NOW - 60_000).toISOString();
    expect(
      nextRefetchMs(
        grid({ nextUpdateAt: past, notes: ["Refreshing live data in the background."] }),
        NOW,
      ),
    ).toBe(15_000);
    // Backing off after a failed fetch: the server's retry time is ahead, so wait for it as usual.
    const ahead = new Date(NOW + 300_000).toISOString();
    expect(
      nextRefetchMs(
        grid({ nextUpdateAt: ahead, notes: ["Refreshing live data in the background."] }),
        NOW,
      ),
    ).toBe(360_000);
  });
  it("is 60 s for a snapshot without nextUpdateAt", () => {
    expect(nextRefetchMs(grid({ isSnapshot: true }), NOW)).toBe(60_000);
    expect(nextRefetchMs(undefined, NOW)).toBe(60_000);
  });
});

describe("ApiError", () => {
  it("maps 429 to a human message", async () => {
    const err = await readError(
      new Response("{}", { status: 429, statusText: "Too Many Requests" }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Too many requests. Wait a minute and try again.");
  });
});

describe("localizeWarning", () => {
  it("translates a known server note and passes unknown text through", () => {
    expect(localizeWarning("Live weather is still loading, using a snapshot.", t)).toBe(
      t("warn.liveLoading"),
    );
    expect(localizeWarning("AI score was repaired (2 fixes).", t)).toBe(t("warn.aiRepaired"));
    expect(
      localizeWarning("Open-Meteo rate limit reached; showing a recent bundled snapshot.", t),
    ).toBe(t("warn.liveRateLimited"));
    expect(localizeWarning("Something new", t)).toBe("Something new");
  });
});

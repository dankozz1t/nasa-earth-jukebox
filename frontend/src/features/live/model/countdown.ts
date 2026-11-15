export const PERIOD_MIN = 30; // live weather refreshes every 30 minutes
const MINUTE_MS = 60_000;

interface Countdown {
  minutes: number; // rounded up, so "1 min" shows until the update is due
  state: "counting" | "updating" | "unknown";
}

export function countdown(nextUpdateAt: string | undefined, now: number): Countdown {
  const due = nextUpdateAt ? Date.parse(nextUpdateAt) : NaN;
  if (!Number.isFinite(due)) return { minutes: 0, state: "unknown" };

  const left = due - now;
  if (left <= 0) return { minutes: 0, state: "updating" };

  return { minutes: Math.ceil(left / MINUTE_MS), state: "counting" };
}

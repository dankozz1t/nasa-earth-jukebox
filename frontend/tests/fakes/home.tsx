// Harness for whole-screen tests (home, axe): fake player and narrator, API fixtures, a no-op canvas,
// and the real app shell over a seeded Query cache.
// Mock the player in the test file like this. The fake lives in its own file because this one imports
// the app, and importing it from the mock factory would deadlock:
//   vi.mock("../src/audio/player-instance", async () => (await import("./fakes/player")).playerModule);

import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { AppRoutes } from "../../src/app/App";
import { Providers } from "../../src/app/providers";
import {
  queryKeys,
  type Frame,
  type Soundscape,
  type WeatherGrid,
  type WeatherSection,
  type WeatherSoundscape,
} from "../../src/shared/api";

export { narrator, player, playerModule } from "./player";

// jsdom has no 2D canvas: a context that accepts every call and records nothing.
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const methods: Record<string, unknown> = {
    canvas,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) =>
      key in methods ? methods[key] : key in target ? target[key] : () => undefined,
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export function installCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return fakeContext(this);
  } as never);
}

export const frame: Frame = {
  id: "svs-5669",
  title: "GEOS Aerosols",
  source: "NASA SVS 5669",
  pageUrl: "",
  timestampUtc: "2025-08-19T20:00:00Z",
  imageUrl: "/api/frames/svs-5669/image",
};

const lats = [-60, -20, 20, 60];
const lons = [-135, -45, 45, 135];
export const grid: WeatherGrid = {
  lats,
  lons,
  observedAt: "2026-11-14T12:00:00Z",
  source: "test",
  isSnapshot: false,
  notes: [],
  values: {
    temperature: lats.map(() => lons.map(() => 20)),
    precipitation: lats.map(() => lons.map(() => 2)),
    clouds: lats.map(() => lons.map(() => 50)),
    wind: lats.map(() => lons.map(() => 10)),
  },
};

export const rain: WeatherSection = {
  key: "precipitation",
  label: "",
  unit: "mm/h",
  low: 0,
  high: 8,
  logScale: true,
  palette: "rain",
  tempoBpm: 76,
  mood: "",
};

function layer(key: string, color: string) {
  return {
    key,
    label: key,
    color,
    voice: "",
    about: "",
    pitchLow: 0,
    pitchHigh: 0,
    pixelCount: 10,
    share: 0.3,
  };
}

export function aerosolScape(): Soundscape {
  return {
    id: "a1",
    mode: "harmony",
    width: 8,
    height: 4,
    bins: 4,
    durationSec: 64,
    stepSec: 16,
    layers: [layer("dust", "#c08040"), layer("sea_salt", "#4080c0"), layer("sulfate", "#c0c040")],
    profiles: [0, 1, 2].map(() => ({ coverage: [1, 1, 1, 1], position: [0.5, 0.5, 0.5, 0.5] })),
    steps: [0, 1, 2, 3].map(() => ({ chord: "Dm9", strength: [0.9, 0.5, 0.2] })),
    artifacts: {
      classMap: "/c.png",
      stems: { dust: "/d.wav", sea_salt: "/s.wav", sulfate: "/u.wav", bed: "/b.wav" },
      mix: "/api/a1/mix.wav",
      midi: "/api/a1/mix.mid",
    },
    frame,
  } as unknown as Soundscape;
}

export function weatherScape(): WeatherSoundscape {
  const n = 8;
  const t = Array.from({ length: n }, (_, k) => k / (n - 1));
  return {
    id: "w1",
    section: rain,
    observedAt: "2026-11-14T12:00:00Z",
    durationSec: 60,
    maxLat: 80,
    title: "Rain",
    rationaleEn: "Rain is heavy near the equator.",
    rationaleUk: "Дощ сильний біля екватора.",
    path: {
      t,
      lat: t.map((x) => 60 * Math.cos(2 * Math.PI * x)),
      lon: t.map((x) => -180 + 360 * x),
      value: t.map(() => 2),
      level: t.map(() => 0.5),
    },
    notes: [{ part: "lead", time: 0, duration: 100, pitch: 80, velocity: 1 }],
    parts: [
      { key: "lead", instrument: "harp" },
      { key: "bass", instrument: "bass" },
    ],
    artifacts: { stems: { lead: "/l.wav", bass: "/b.wav" }, mix: "" },
  } as unknown as WeatherSoundscape;
}

/** A Query cache that already holds everything the home screen asks for, so nothing hits the network. */
export function seededClient(aiAvailable = true): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.frames, [frame]);
  client.setQueryData(queryKeys.weather.grid, grid);
  client.setQueryData(queryKeys.weather.sections, [rain]);
  client.setQueryData(queryKeys.weather.composer, { aiAvailable });
  return client;
}

/** The real app shell (skip links, header, routes) at `path`. */
export function renderApp(path: string, client: QueryClient) {
  return render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}

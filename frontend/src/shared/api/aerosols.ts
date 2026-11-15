export type Mode = "raw" | "scale" | "harmony";

export interface Frame {
  id: string;
  title: string;
  source: string;
  pageUrl: string;
  timestampUtc: string;
  imageUrl: string;
}

export interface Layer {
  key: string;
  label: string;
  color: string;
  voice: string;
  about: string;
  pitchLow: number;
  pitchHigh: number;
  pixelCount: number;
  share: number;
}

export interface Note {
  layer: number;
  step: number;
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface Soundscape {
  id: string;
  width: number;
  height: number;
  bins: number;
  durationSec: number;
  stepSec: number;
  sampleRate: number;
  mode: Mode;
  hueSource: string;
  warnings: string[];
  layers: Layer[];
  profiles: { coverage: number[]; position: (number | null)[] }[];
  steps: { chord: string; strength: number[] }[];
  notes: Note[];
  bed: Note[];
  artifacts: { classMap: string; stems: Record<string, string>; mix: string; midi: string };
  frame: Frame | null;
}

export interface ComposeSettings {
  mode: Mode;
  durationSec: number;
  sensitivity: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function responseMessage(response: Response): Promise<string> {
  const statusLine = `${response.status} ${response.statusText}`;

  try {
    const body = await response.json();
    const fieldErrors = body.errors
      ? Object.values(body.errors as Record<string, string[]>).flat()
      : [];
    return [body.detail ?? body.title, ...fieldErrors].filter(Boolean).join(" ") || statusLine;
  } catch {
    return statusLine; // not JSON
  }
}

export async function readError(response: Response): Promise<ApiError> {
  let message = await responseMessage(response);

  if (response.status === 429) message = "Too many requests. Wait a minute and try again.";
  if (response.status === 502 || response.status === 503) {
    message = "The sound service is not available right now.";
  }

  return new ApiError(message, response.status);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export const aerosolApi = {
  frames: () => fetch("/api/frames").then((r) => readJson<Frame[]>(r)),

  compose: (frameId: string, s: ComposeSettings, signal?: AbortSignal) =>
    fetch("/api/soundscapes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frameId, ...s }),
      signal,
    }).then((r) => readJson<Soundscape>(r)),

  upload: (file: File, s: ComposeSettings, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("image", file);
    form.append("mode", s.mode);
    form.append("durationSec", String(s.durationSec));
    form.append("sensitivity", String(s.sensitivity));
    return fetch("/api/soundscapes/upload", { method: "POST", body: form, signal }).then((r) =>
      readJson<Soundscape>(r),
    );
  },

  bytes: async (url: string, signal?: AbortSignal): Promise<ArrayBuffer> => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw await readError(r);
    return r.arrayBuffer();
  },
};

export function withSelection(url: string, layers: string[], bed: boolean): string {
  const q = new URLSearchParams({ layers: layers.join(","), bed: String(bed) });
  return `${url}?${q}`;
}

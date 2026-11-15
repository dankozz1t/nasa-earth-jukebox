// Stem bytes for the last few compositions, kept outside TanStack Query because ArrayBuffers are big.
// One download per composition; it is cancelled only when every caller has given up.

import { aerosolApi } from "../../shared/api/aerosols";
import { abortError } from "../../shared/lib/abort";

export type Stems = Record<string, ArrayBuffer>;
type FetchBytes = (url: string, signal?: AbortSignal) => Promise<ArrayBuffer>;

interface HasStems {
  id: string;
  artifacts: { stems: Record<string, string> };
}

interface Entry {
  promise: Promise<Stems>;
  abort: AbortController;
  waiters: number;
  settled: boolean;
  done: number;
  total: number;
  progress: Set<(fraction: number) => void>;
}

interface StemsCache {
  get(s: HasStems, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<Stems>;
  has(id: string): boolean;
  clear(): void;
}

export function createStemsCache(fetchBytes: FetchBytes, size = 3): StemsCache {
  const entries = new Map<string, Entry>();

  function start(s: HasStems): Entry {
    const keys = Object.keys(s.artifacts.stems);
    const abort = new AbortController();
    const entry: Entry = {
      promise: Promise.resolve({}),
      abort,
      waiters: 0,
      settled: false,
      done: 0,
      total: keys.length,
      progress: new Set(),
    };

    entry.promise = Promise.all(
      keys.map((k) =>
        fetchBytes(s.artifacts.stems[k], abort.signal).then((bytes) => {
          entry.done++;
          for (const cb of entry.progress) cb(entry.done / entry.total);
          return bytes;
        }),
      ),
    ).then((list) => Object.fromEntries(keys.map((k, i) => [k, list[i]])));

    entry.promise.then(
      () => {
        entry.settled = true;
      },
      () => {
        entry.settled = true;
        if (entries.get(s.id) === entry) entries.delete(s.id);
      },
    );

    entries.set(s.id, entry);
    while (entries.size > size) {
      const oldest = entries.keys().next().value!;
      entries.delete(oldest);
    }

    return entry;
  }

  function get(
    s: HasStems,
    signal?: AbortSignal,
    onProgress?: (fraction: number) => void,
  ): Promise<Stems> {
    if (signal?.aborted) return Promise.reject(abortError());

    let entry = entries.get(s.id);
    if (entry) {
      // Re-insert, so the most recently used goes last.
      entries.delete(s.id);
      entries.set(s.id, entry);
    } else {
      entry = start(s);
    }

    const e = entry;
    if (onProgress) {
      e.progress.add(onProgress);
      if (e.total > 0) onProgress(e.done / e.total);
    }

    if (!signal) {
      e.waiters = Infinity; // a caller without a signal keeps the download alive
      return e.promise.finally(() => {
        if (onProgress) e.progress.delete(onProgress);
      });
    }

    e.waiters++;
    return new Promise<Stems>((resolve, reject) => {
      const leave = () => {
        signal.removeEventListener("abort", onAbort);
        if (onProgress) e.progress.delete(onProgress);
      };
      const onAbort = () => {
        leave();
        e.waiters--;
        if (e.waiters <= 0 && !e.settled) {
          e.abort.abort();
          if (entries.get(s.id) === e) entries.delete(s.id);
        }
        reject(abortError());
      };

      signal.addEventListener("abort", onAbort);
      e.promise.then(
        (v) => {
          leave();
          resolve(v);
        },
        (err) => {
          leave();
          reject(err);
        },
      );
    });
  }

  return {
    get,
    has: (id) => entries.has(id),
    clear: () => entries.clear(),
  };
}

// The tour's four layers plus the piece before it: no layer downloads twice in one lap, and going back
// to the previous preset is instant.
export const STEMS_CACHE_SIZE = 5;

export const stemsCache = createStemsCache(
  (url, signal) => aerosolApi.bytes(url, signal),
  STEMS_CACHE_SIZE,
);

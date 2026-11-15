import type { Repeat } from "../../../audio/stem-player";
import type { SectionKey } from "../../../shared/api/weather";

export type { Repeat };

export const LAYER_ORDER: readonly SectionKey[] = [
  "temperature",
  "precipitation",
  "clouds",
  "wind",
];

export function isRepeat(v: unknown): v is Repeat {
  return v === "off" || v === "one" || v === "all";
}

export function nextLayer(key: SectionKey): SectionKey {
  const i = LAYER_ORDER.indexOf(key);
  return LAYER_ORDER[(i + 1) % LAYER_ORDER.length];
}

export function playOrder(from: SectionKey): SectionKey[] {
  const i = Math.max(0, LAYER_ORDER.indexOf(from));
  return [...LAYER_ORDER.slice(i), ...LAYER_ORDER.slice(0, i)];
}

export class LayerShelf<T> {
  private items = new Map<SectionKey, { gen: number; value: T }>();

  put(key: SectionKey, gen: number, value: T): boolean {
    const have = this.items.get(key);
    if (have && have.gen > gen) return false;

    this.items.set(key, { gen, value });
    return true;
  }

  get(key: SectionKey): { gen: number; value: T } | undefined {
    return this.items.get(key);
  }

  fresh(key: SectionKey, gen: number): T | undefined {
    const have = this.items.get(key);
    return have && have.gen === gen ? have.value : undefined;
  }

  count(): number {
    return this.items.size;
  }

  countFresh(gen: number): number {
    let n = 0;
    for (const v of this.items.values()) {
      if (v.gen === gen) n++;
    }
    return n;
  }
}

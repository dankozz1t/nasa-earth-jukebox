import { firstPreset, PRESETS, type Preset } from "./presets";
import type { SessionPresetId, Source } from "./session.store";

export const SIDE: Record<Source, "A" | "B"> = { nasa: "A", live: "B" };

interface ShelfItem {
  id: SessionPresetId;
  preset: Preset;
  custom: boolean;
  fresh?: boolean; // "Create your mix": no mix of this source yet
}

// The person's own mix always comes first: "Create your mix" until there is one for this source, then
// "Your mix". `mix` is that source's mix.
export function shelfItems(source: Source, mix?: Preset): ShelfItem[] {
  const own = mix?.source === source ? mix : undefined;
  const items: ShelfItem[] = PRESETS.filter((p) => p.source === source).map((preset) => ({
    id: preset.id,
    preset,
    custom: false,
  }));

  items.unshift({ id: "custom", preset: own ?? firstPreset(source), custom: true, fresh: !own });
  return items;
}

// Wraps round the row, passing over skipped ids. With nothing selected in this row, forward lands on the
// first record and back on the last. Null when nothing else can be picked.
export function adjacentPreset(
  ids: readonly SessionPresetId[],
  selected: SessionPresetId | null,
  step: 1 | -1,
  skip: (id: SessionPresetId) => boolean = () => false,
): SessionPresetId | null {
  const n = ids.length;
  const from = selected === null ? -1 : ids.indexOf(selected);

  const indexAt = (k: number) => {
    if (from >= 0) return (((from + step * k) % n) + n) % n;
    return step === 1 ? k - 1 : n - k;
  };

  for (let k = 1; k <= n; k++) {
    const id = ids[indexAt(k)];
    if (id === undefined || id === selected) return null;
    if (!skip(id)) return id;
  }

  return null;
}

export function focusSleeve(source: Source): boolean {
  const row = document.querySelector(`[data-side="${SIDE[source]}"]`);
  const sleeve =
    row?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
    row?.querySelector<HTMLElement>('[role="radio"]');
  if (!sleeve) return false;

  sleeve.focus();
  sleeve.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}

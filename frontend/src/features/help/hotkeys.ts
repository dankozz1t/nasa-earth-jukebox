// The one definition of the keyboard map. A test checks it against what the hooks register,
// so a key cannot be added to the page without showing up in the shortcuts dialog.

interface HotkeyRow {
  id: string;
  // "@name" is an i18n key (a word on the cap); anything else is shown as it is.
  caps: readonly string[];
  label: string;
  // In useHotkeys spelling. Empty when the key belongs to a widget (arrows on a slider).
  combos: readonly string[];
}

export const LAYER_KEYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export const HOTKEYS: readonly HotkeyRow[] = [
  { id: "play", caps: ["@key.cap.space"], label: "key.space", combos: ["space"] },
  { id: "volume", caps: ["-", "="], label: "key.volume", combos: ["-", "="] },
  { id: "layers", caps: ["1–7"], label: "key.numbers", combos: [...LAYER_KEYS] },
  {
    id: "solo",
    caps: ["@key.cap.shift", "1–7"],
    label: "key.shiftNumbers",
    combos: LAYER_KEYS.map((k) => `Shift+${k}`),
  },
  { id: "where", caps: ["W"], label: "key.w", combos: ["w"] },
  { id: "describe", caps: ["D"], label: "key.d", combos: ["d"] },
  { id: "speech", caps: ["S"], label: "key.s", combos: ["s"] },
  { id: "live", caps: ["L"], label: "key.live", combos: ["l"] },
  { id: "shelf", caps: ["P"], label: "key.shelf", combos: ["p"] },
  { id: "preset", caps: ["[", "]"], label: "key.preset", combos: ["[", "]"] },
  { id: "access", caps: ["A"], label: "key.access", combos: ["a"] },
  { id: "help", caps: ["?"], label: "key.help", combos: ["Shift+slash"] },
  { id: "arrows", caps: ["←", "→"], label: "key.arrows", combos: [] },
  { id: "updown", caps: ["↑", "↓"], label: "key.updown", combos: [] },
];

export function listedCombos(): string[] {
  return HOTKEYS.flatMap((r) => r.combos.map((c) => c.toLowerCase()));
}

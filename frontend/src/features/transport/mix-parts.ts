import { useMemo } from "react";
import { layerText, useT } from "../../shared/i18n";
import { layerColor, TEXTURES, usePrefs, type Texture } from "../access";
import { isWeather, useSession, type AnySoundscape } from "../presets";

export interface MixPart {
  key: string;
  label: string;
  color: string;
  texture: Texture;
}

// Each part also has a texture, so no part is told apart by colour alone.
const WEATHER_LOOK: Record<string, { color: string; texture: Texture }> = {
  lead: { color: "var(--cobalt)", texture: "diagonal" },
  strings: { color: "var(--tomato)", texture: "horizontal" },
  bass: { color: "var(--ink)", texture: "cross" },
  arpeggio: { color: "var(--sun)", texture: "dots" },
  bells: { color: "var(--cobalt)", texture: "dots" },
  percussion: { color: "var(--ink-2)", texture: "diagonal" },
  texture: { color: "var(--stone)", texture: "horizontal" },
};

const FALLBACK_LOOK = { color: "var(--ink-2)", texture: "dots" as Texture };

export function useMixParts(): MixPart[] {
  const { t, lang } = useT();
  const soundscape = useSession((s) => s.soundscape);
  const colorSafe = usePrefs((p) => p.colorSafe);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` reads the language from the i18n module
  return useMemo(() => mixParts(soundscape, colorSafe, t), [soundscape, colorSafe, t, lang]);
}

function mixParts(
  s: AnySoundscape | undefined,
  colorSafe: boolean,
  t: (key: string) => string,
): MixPart[] {
  if (!s) return [];

  if (isWeather(s)) {
    return s.parts.map((p) => ({
      key: p.key,
      label: t(`w.part.${p.key}`),
      ...(WEATHER_LOOK[p.key] ?? FALLBACK_LOOK),
    }));
  }

  return s.layers.map((l) => ({
    key: l.key,
    label: layerText(l.key).label,
    color: layerColor(l.key, l.color, { colorSafe }),
    texture: TEXTURES[l.key] ?? "dots",
  }));
}

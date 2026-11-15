import { useState, type KeyboardEvent } from "react";
import { getNarrator, getPlayer } from "../../audio/player-instance";
import type { Soundscape, WeatherGrid, WeatherSection, WeatherSoundscape } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { moveCursor, type AerosolCursor } from "./draw-aerosols";
import type { LatLon } from "./draw-weather";
import {
  aerosolNowText,
  aerosolOnPlayer,
  aerosolSpot,
  columnX,
  releaseProbe,
  soundAerosolSpot,
  soundWeatherProbe,
  weatherNowText,
  weatherProbe,
  type Muted,
} from "./explore";
import styles from "./stage.module.css";

interface Common {
  id?: string;
  muted: Muted;
  stereo: boolean;
  vibrate: boolean;
}

type ExplorerProps = Common &
  (
    | {
        kind: "nasa";
        soundscape?: Soundscape;
        classMap: Uint8Array | null;
        cursor: AerosolCursor;
        onCursor(c: AerosolCursor): void;
        onNeedSound?(): Promise<boolean>;
      }
    | {
        kind: "live";
        soundscape?: WeatherSoundscape;
        grid?: WeatherGrid;
        section?: WeatherSection;
        probe: LatLon | null;
        onProbe(p: LatLon): void;
      }
  );

// [step, y] moves for the aerosol cursor; Shift moves 8 steps.
const AEROSOL_KEYS = (big: number): Record<string, [number, number]> => ({
  ArrowLeft: [-big, 0],
  ArrowRight: [big, 0],
  ArrowUp: [0, -0.05 * big],
  ArrowDown: [0, 0.05 * big],
  Home: [-1e6, 0],
  End: [1e6, 0],
  PageUp: [-16, 0],
  PageDown: [16, 0],
});

// [lat, lon] moves in degrees: 5°, or 20° with Shift.
const WEATHER_KEYS = (step: number): Record<string, [number, number]> => ({
  ArrowLeft: [0, -step],
  ArrowRight: [0, step],
  ArrowUp: [step, 0],
  ArrowDown: [-step, 0],
  Home: [0, -360],
  End: [0, 360],
});

function edgeLon(key: string): number | undefined {
  if (key === "Home") return -175;
  if (key === "End") return 175;
  return undefined;
}

export function Explorer(props: ExplorerProps) {
  const { t, lang } = useT();
  const [said, setSaid] = useState("");
  const id = props.id ?? "map-explorer";

  let label: string;
  let min: number;
  let max: number;
  let now: number;
  let text = t("explorer.notStarted");

  if (props.kind === "nasa") {
    const s = props.soundscape;
    label = t("explorer.label");
    min = 0;
    max = s ? s.bins - 1 : 0;
    now = Math.max(0, props.cursor.step);
    if (s && props.classMap && props.cursor.step >= 0) {
      const { step, y } = props.cursor;
      text = aerosolSpot(s, props.classMap, columnX(s, step), y * s.height).text;
    }
  } else {
    const section = props.soundscape?.section ?? props.section;
    label = t("w.explorer");
    min = -180;
    max = 180;
    now = Math.round(props.probe?.lon ?? 0);
    if (props.grid && section && props.probe) {
      const { lat, lon } = props.probe;
      text = weatherProbe(props.grid, section, lat, lon, lang, props.stereo).text;
    }
  }

  function say(words: string) {
    setSaid(words);
    getNarrator().speak(words);
  }

  function whereAmI() {
    const player = getPlayer();

    if (props.kind === "nasa") {
      if (!props.soundscape) return;

      const lastSpot = props.cursor.step >= 0 ? text : "";
      say(aerosolNowText(props.soundscape, player.position, player.playing, props.muted, lastSpot));
      return;
    }

    if (props.soundscape) {
      say(
        weatherNowText(
          props.soundscape,
          props.grid,
          player.position,
          player.playing,
          props.probe,
          lang,
          props.stereo,
        ),
      );
    } else if (props.probe) {
      say(text);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "w" || e.key === "W") {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      e.preventDefault();
      whereAmI();
      return;
    }

    if (props.kind === "nasa") {
      const d = AEROSOL_KEYS(e.shiftKey ? 8 : 1)[e.key];
      const s = props.soundscape;
      if (!d || !s) return;

      e.preventDefault();
      const c = moveCursor(props.cursor, s.bins, d[0], d[1]);
      props.onCursor(c);
      if (!props.classMap) return;

      const x = columnX(s, c.step);
      const spot = aerosolSpot(s, props.classMap, x, c.y * s.height);
      getNarrator().speak(spot.text);
      const { muted, vibrate } = props;
      const sound = () => soundAerosolSpot(s, x, spot.mix, muted, vibrate);
      if (aerosolOnPlayer(s)) sound();
      else void props.onNeedSound?.().then((ok) => ok && sound());
    } else {
      const d = WEATHER_KEYS(e.shiftKey ? 20 : 5)[e.key];
      const section = props.soundscape?.section ?? props.section;
      if (!d || !props.grid || !section) return;

      e.preventDefault();
      const q = props.probe ?? { lat: 0, lon: 0 };
      const lon = edgeLon(e.key) ?? q.lon + d[1];
      const p = weatherProbe(props.grid, section, q.lat + d[0], lon, lang, props.stereo);
      props.onProbe({ lat: p.lat, lon: p.lon });
      getNarrator().speak(p.text);
      soundWeatherProbe(section, p, props.stereo, true, props.vibrate, props.soundscape?.maxLat);
    }
  }

  return (
    <>
      <div
        id={id}
        role="slider"
        data-explorer=""
        tabIndex={0}
        className={styles.explorer}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={now}
        aria-valuetext={text}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown W"
        onKeyDown={onKeyDown}
        onBlur={releaseProbe}
      />
      <p className="visually-hidden" role="status">
        {said}
      </p>
    </>
  );
}

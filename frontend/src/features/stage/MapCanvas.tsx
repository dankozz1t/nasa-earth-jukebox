import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { getNarrator, getPlayer } from "../../audio/player-instance";
import type { Soundscape, WeatherGrid, WeatherSection, WeatherSoundscape } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { EarIcon, InfoTip } from "../../shared/ui";
import type { Prefs } from "../access";
import { describeStep } from "../aerosols";
import { panFor, weatherReadout } from "../live/model/describe-weather";
import { BED } from "../presets";
import {
  buildAerosolLayers,
  createAerosolAnim,
  drawAerosolBase,
  drawAerosolOverlay,
  frameCoords,
  nearLine,
  scrubFraction,
  type AerosolCursor,
} from "./draw-aerosols";
import {
  createWeatherAnim,
  currentFrac,
  drawWeatherBase,
  drawWeatherOverlay,
  flashesActive,
  H,
  nearPath,
  pathPoint,
  pointerLatLon,
  W,
  type Flash,
  type LatLon,
  type WavePreview,
} from "./draw-weather";
import {
  aerosolOnPlayer,
  aerosolSpot,
  audible,
  columnX,
  releaseProbe,
  soundAerosolSpot,
  soundWeatherProbe,
  weatherNowText,
  weatherProbe,
  type Muted,
} from "./explore";
import styles from "./stage.module.css";

const GRAIN_GAP_MS = 140;
const NO_FLASHES: readonly Flash[] = [];

interface Common {
  prefs: Prefs;
  muted: Muted;
  children?: ReactNode; // overlays inside the map box; their pointer events reach the map
}

type MapCanvasProps = Common &
  (
    | {
        kind: "nasa";
        soundscape?: Soundscape;
        frameImage: HTMLImageElement | null;
        classMap: Uint8Array | null;
        cursor: AerosolCursor;
        // Puts the piece on the player in silence, so the map can sound it; true once it is there.
        onNeedSound?(): Promise<boolean>;
      }
    | {
        kind: "live";
        soundscape?: WeatherSoundscape;
        grid?: WeatherGrid;
        section?: WeatherSection;
        basemap: HTMLImageElement | null;
        probe: LatLon | null;
        flashes?: readonly Flash[];
        preview?: WavePreview | null;
      }
  );

function canvasSize(p: MapCanvasProps): { w: number; h: number } {
  if (p.kind === "live") return { w: W, h: H };
  if (p.soundscape) return { w: p.soundscape.width, h: p.soundscape.height };
  if (p.frameImage?.naturalWidth) {
    return { w: p.frameImage.naturalWidth, h: p.frameImage.naturalHeight };
  }

  return { w: W, h: H };
}

type Layers = ReturnType<typeof buildAerosolLayers>;

// The coloured layers of each archive piece, so switching to live and back paints at once.
const layerCache = new WeakMap<Soundscape, { key: unknown[]; layers: Layers }>();

function cachedLayers(
  img: HTMLImageElement,
  map: Uint8Array,
  s: Soundscape,
  prefs: { highContrast: boolean; colorSafe: boolean },
): Layers {
  const key = [img, map, prefs.highContrast, prefs.colorSafe];
  const hit = layerCache.get(s);
  if (hit && hit.key.every((v, i) => v === key[i])) return hit.layers;

  const layers = buildAerosolLayers(document, img, map, s, prefs);
  layerCache.set(s, { key, layers });
  return layers;
}

// Two canvases: the base is redrawn when the data, mix or colour prefs change; the overlay is drawn in
// requestAnimationFrame from `getPlayer().position`, so playback never re-renders React.
export function MapCanvas(props: MapCanvasProps) {
  const { t, lang } = useT();
  const { w, h } = canvasSize(props);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const balanceRef = useRef<HTMLSpanElement>(null);
  const latest = useRef(props);
  const scrubbing = useRef(false);
  const lastGrain = useRef(0);
  const probe = useRef<LatLon | null>(null);
  const aerosolAnim = useRef(createAerosolAnim());
  const weatherAnim = useRef(createWeatherAnim());
  const raf = useRef(0);
  const langRef = useRef(lang);

  useLayoutEffect(() => {
    latest.current = props;
    langRef.current = lang;
  });

  const showReadout = useCallback((text: string) => {
    const el = readoutRef.current;
    if (el && el.textContent !== text) el.textContent = text;
  }, []);

  const showBalance = useCallback((pan: number) => {
    const el = balanceRef.current;
    const left = `${50 + Math.max(-1, Math.min(1, pan)) * 50}%`;
    if (el && el.style.left !== left) el.style.left = left;
  }, []);

  const drawOverlay = useCallback(
    (now: number): boolean => {
      const p = latest.current;
      const player = getPlayer();

      if (p.kind === "live" && p.soundscape && (player.playing || scrubbing.current)) {
        const s = p.soundscape;
        const fi = currentFrac(s, player.position, player.playing, scrubbing.current);
        if (fi >= 0) {
          const pt = pathPoint(s, fi, p.preview, p.grid);
          showReadout(weatherReadout(s.section.key, pt.lat, pt.lon, pt.value, langRef.current));
          showBalance(panFor(pt.lat, p.prefs.stereo, s.maxLat));
        }
      }

      const ctx = overlayRef.current?.getContext("2d");
      if (!ctx) return false;

      const moving = player.playing || scrubbing.current;

      if (p.kind === "nasa") {
        if (!p.soundscape) {
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          return false;
        }
        drawAerosolOverlay(ctx, p.soundscape, {
          position: player.position,
          playing: player.playing,
          scrubbing: scrubbing.current,
          cursor: p.cursor,
          prefs: p.prefs,
          isOn: (key) => !p.muted[key],
          anim: aerosolAnim.current,
          now,
        });
        return moving;
      }

      const s = p.soundscape;
      const flashes = p.flashes ?? NO_FLASHES;
      const fi = s ? currentFrac(s, player.position, player.playing, scrubbing.current) : -1;

      drawWeatherOverlay(ctx, s, fi, flashes, {
        playing: player.playing,
        scrubbing: scrubbing.current,
        probe: probe.current,
        preview: p.preview,
        grid: p.grid,
        highContrast: p.prefs.highContrast,
        reduceMotion: p.prefs.reduceMotion,
        anim: weatherAnim.current,
        now,
      });

      return (moving && !!s) || flashesActive(flashes, now);
    },
    [showReadout, showBalance],
  );

  const kick = useCallback(() => {
    if (raf.current) return;

    const frame = (now: number) => {
      raf.current = 0;
      if (drawOverlay(now)) raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }, [drawOverlay]);

  useEffect(() => getPlayer().subscribe(kick), [kick]);

  // Reset the handle too: StrictMode unmounts and remounts, and a stale id would block every later kick().
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  // The keyboard probe replaces the pointer one: last writer wins.
  const keyboardProbe = props.kind === "live" ? props.probe : null;
  useEffect(() => {
    probe.current = keyboardProbe;
  }, [keyboardProbe]);

  useEffect(() => kick());

  const nasa = props.kind === "nasa" ? props : null;
  const live = props.kind === "live" ? props : null;
  const { highContrast, colorSafe } = props.prefs;
  const { muted } = props;
  const aerosol = nasa?.soundscape;
  const frameImage = nasa?.frameImage ?? null;
  const classMap = nasa?.classMap ?? null;
  const grid = live?.grid;
  const basemap = live?.basemap ?? null;
  const section = live ? (live.soundscape?.section ?? live.section) : undefined;

  const layers = useMemo(() => {
    if (!aerosol || !frameImage || !classMap) return null;
    return cachedLayers(frameImage, classMap, aerosol, { highContrast, colorSafe });
  }, [aerosol, frameImage, classMap, highContrast, colorSafe]);

  useEffect(() => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    if (aerosol && layers) {
      drawAerosolBase(ctx, layers, aerosol, (key) => !muted[key]);
    } else if (frameImage) {
      ctx.drawImage(frameImage, 0, 0, w, h);
    } else if (grid && section) {
      const palette = colorSafe ? "safe" : section.palette;
      drawWeatherBase(ctx, basemap, grid, section, palette, highContrast);
    }
  }, [w, h, layers, aerosol, frameImage, muted, grid, basemap, section, colorSafe, highContrast]);

  const setReadout = showReadout;
  const hoverHint = t("readout.hover");
  useEffect(() => setReadout(hoverHint), [hoverHint, setReadout]);

  const stereo = props.prefs.stereo;

  useEffect(() => {
    if (!keyboardProbe || !grid || !section) return;

    const q = weatherProbe(grid, section, keyboardProbe.lat, keyboardProbe.lon, lang, stereo);
    showReadout(weatherReadout(section.key, q.lat, q.lon, q.value, lang));
    showBalance(panFor(q.lat, stereo, live?.soundscape?.maxLat));
  }, [
    keyboardProbe,
    grid,
    section,
    lang,
    stereo,
    live?.soundscape?.maxLat,
    showReadout,
    showBalance,
  ]);

  const cursor = nasa?.cursor;

  useEffect(() => {
    if (!cursor || cursor.step < 0 || !aerosol || !classMap) return;

    const x = columnX(aerosol, cursor.step);
    const y = cursor.y * aerosol.height;
    showReadout(aerosolSpot(aerosol, classMap, x, y).text);
  }, [cursor, aerosol, classMap, showReadout]);

  function rect(): DOMRect {
    return wrapRef.current!.getBoundingClientRect();
  }

  function setCursorHint(hint: "" | "scrub" | "path") {
    if (wrapRef.current) wrapRef.current.dataset.cursor = hint;
  }

  function exploreAerosol(x: number, y: number, speak: boolean) {
    if (!nasa?.soundscape || !nasa.classMap) return;

    const s = nasa.soundscape;
    const spot = aerosolSpot(s, nasa.classMap, x, y);
    setReadout(spot.text);
    if (speak) getNarrator().speak(spot.text);

    const { muted, onNeedSound } = nasa;
    const { vibrate } = props.prefs;
    if (aerosolOnPlayer(s)) {
      soundAerosolSpot(s, x, spot.mix, muted, vibrate);
      return;
    }

    // A fresh page, or the other source on the player: the piece is loaded in silence first. A click sounds
    // its spot once it is there; a hover sounds at the next move.
    void onNeedSound?.().then((ok) => {
      if (ok && speak) soundAerosolSpot(s, x, spot.mix, muted, vibrate);
    });
  }

  function probeWeather(lat: number, lon: number, speak: boolean) {
    if (!live?.grid || !section) return;

    const p = weatherProbe(live.grid, section, lat, lon, lang, props.prefs.stereo);
    probe.current = { lat: p.lat, lon: p.lon };
    setReadout(weatherReadout(section.key, p.lat, p.lon, p.value, lang));
    showBalance(panFor(p.lat, props.prefs.stereo, live.soundscape?.maxLat));
    if (speak) getNarrator().speak(p.text);

    kick();
    soundWeatherProbe(
      section,
      p,
      props.prefs.stereo,
      speak,
      props.prefs.vibrate,
      live.soundscape?.maxLat,
    );
  }

  function playGrain(time: number, weights: Record<string, number>) {
    const now = performance.now();
    if (now - lastGrain.current <= GRAIN_GAP_MS) return;

    lastGrain.current = now;
    void getPlayer().spot(time, weights);
  }

  function scrubTo(ev: PointerEvent) {
    const player = getPlayer();
    const xf = scrubFraction(ev.clientX, rect());

    if (nasa?.soundscape) {
      const s = nasa.soundscape;
      player.seek(xf * s.durationSec);

      if (!player.playing) {
        const weights: Record<string, number> = { [BED]: 0.4 };
        for (const l of s.layers) {
          weights[l.key] = nasa.muted[l.key] ? 0 : 0.9;
        }
        playGrain(xf * s.durationSec, weights);

        const step = Math.min(s.bins - 1, Math.floor(xf * s.bins));
        setReadout(describeStep(audible(s, nasa.muted), step));
      }
    } else if (live?.soundscape) {
      const s = live.soundscape;
      player.seek(xf * s.durationSec);

      const pt = pathPoint(s, xf * (s.path.lat.length - 1), live.preview, live.grid);
      const pan = panFor(pt.lat, props.prefs.stereo, s.maxLat);
      setReadout(weatherReadout(s.section.key, pt.lat, pt.lon, pt.value, lang));
      showBalance(pan);

      if (!player.playing) {
        player.setPan(pan);
        const weights = Object.fromEntries(
          s.parts.map((q) => [q.key, live.muted[q.key] ? 0 : 0.9]),
        );
        playGrain(xf * s.durationSec, weights);
      }
    }

    kick();
  }

  function startScrub(ev: PointerEvent) {
    scrubbing.current = true;
    try {
      wrapRef.current?.setPointerCapture(ev.pointerId); // keeps dragging outside the map
    } catch {
      // Synthetic or already released pointers cannot be captured; dragging still works inside.
    }

    setCursorHint("scrub");
    scrubTo(ev);
  }

  function onPointerMove(ev: PointerEvent) {
    if (scrubbing.current) {
      scrubTo(ev);
      return;
    }

    const player = getPlayer();
    const r = rect();

    if (nasa) {
      const s = nasa.soundscape;
      if (!s) return;

      const onLine = player.playing || nearLine(ev.clientX, r, player.position, s.durationSec);
      setCursorHint(onLine ? "scrub" : "");

      const c = frameCoords(ev.clientX, ev.clientY, r, s);
      if (c) exploreAerosol(c.x, c.y, false);
    } else if (live) {
      const s = live.soundscape;
      const onPath = s && nearPath(ev.clientX, ev.clientY, r, s, live.preview, live.grid);
      setCursorHint(onPath ? "path" : "");

      const q = pointerLatLon(ev.clientX, ev.clientY, r);
      probeWeather(q.lat, q.lon, false);
    }
  }

  function onPointerDown(ev: PointerEvent) {
    const player = getPlayer();
    const r = rect();

    if (nasa) {
      const s = nasa.soundscape;
      const c = s && frameCoords(ev.clientX, ev.clientY, r, s);
      if (!s || !c) return;

      if (player.playing || nearLine(ev.clientX, r, player.position, s.durationSec)) {
        startScrub(ev);
      } else {
        exploreAerosol(c.x, c.y, true);
      }
    } else if (live) {
      const s = live.soundscape;
      const grabsWave =
        s && (player.playing || nearPath(ev.clientX, ev.clientY, r, s, live.preview, live.grid));

      if (grabsWave) {
        releaseProbe();
        startScrub(ev);
        return;
      }
      const q = pointerLatLon(ev.clientX, ev.clientY, r);
      probeWeather(q.lat, q.lon, true);
    }
  }

  function endScrub(ev: PointerEvent) {
    if (!scrubbing.current) return;

    scrubbing.current = false;
    setCursorHint("");
    if (wrapRef.current?.hasPointerCapture(ev.pointerId)) {
      wrapRef.current.releasePointerCapture(ev.pointerId);
    }

    const player = getPlayer();

    if (nasa?.soundscape) {
      const s = nasa.soundscape;
      const step = Math.min(s.bins - 1, Math.floor((player.position / s.durationSec) * s.bins));
      getNarrator().speak(describeStep(audible(s, nasa.muted), step));
    } else if (live?.soundscape) {
      const text = weatherNowText(
        live.soundscape,
        live.grid,
        player.position,
        player.playing,
        probe.current,
        lang,
        props.prefs.stereo,
      );
      getNarrator().speak(text);
    }

    kick();
  }

  function onPointerLeave() {
    setReadout(hoverHint);
    if (!live) return;

    releaseProbe();
    probe.current = null;
    kick();
  }

  return (
    <>
      <div className={styles.frame}>
        <div
          ref={wrapRef}
          className={styles.wrap}
          style={{ aspectRatio: `${w} / ${h}` }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onPointerLeave={onPointerLeave}
        >
          <canvas ref={baseRef} className={styles.canvas} width={w} height={h} aria-hidden="true" />
          <canvas
            ref={overlayRef}
            className={styles.canvas}
            width={w}
            height={h}
            aria-hidden="true"
          />
          {props.children}
        </div>
      </div>
      <div className={styles.under}>
        {/* Hidden from screen readers: the explorer's value text and the captions carry the same words. */}
        <p ref={readoutRef} className={styles.readout} aria-hidden="true" />
        {live && props.prefs.stereo && (
          <>
            <span className={styles.balance} data-balance="" aria-hidden="true">
              <EarIcon side="left" size={18} />
              <span>{t("balance.left")}</span>
              <span className={styles.balanceTrack}>
                <span ref={balanceRef} className={styles.balanceDot} data-balance-dot="" />
              </span>
              <span>{t("balance.right")}</span>
              <EarIcon side="right" size={18} />
            </span>
            <InfoTip label={t("balance.tip.label")}>{t("balance.tip")}</InfoTip>
          </>
        )}
      </div>
    </>
  );
}

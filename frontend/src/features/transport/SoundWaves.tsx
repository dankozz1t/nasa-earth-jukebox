import { useEffect, useRef } from "react";
import { getPlayer } from "../../audio/player-instance";
import { usePlayer } from "../../audio/usePlayer";
import { usePrefs } from "../access";
import { barLevels, drawBars, drawFlat, REDUCED_FPS, type WaveColors } from "./draw-waves";
import styles from "./bar.module.css";

// Used when layout gives no size (tests, a hidden bar); CSS sets the real one.
const FALLBACK_W = 144;
const FALLBACK_H = 40;

function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { w: number; h: number } {
  const w = canvas.clientWidth || FALLBACK_W;
  const h = canvas.clientHeight || FALLBACK_H;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);

  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { w, h };
}

function colorsOf(canvas: HTMLCanvasElement): WaveColors {
  const css = getComputedStyle(canvas);

  return {
    ink: css.color || "#111111",
    accent: css.getPropertyValue("--tomato").trim() || "#D9573A",
  };
}

// Hidden from assistive tech: the captions and the now line already say what sounds.
export function SoundWaves() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { playing } = usePlayer();
  const reduceMotion = usePrefs((p) => p.reduceMotion);
  // Only a dependency: a theme or contrast change redraws with the new CSS colours.
  const look = usePrefs((p) => `${p.theme} ${p.highContrast}`);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const colors = colorsOf(canvas);
    const drawIdle = () => {
      const { w, h } = fit(canvas, ctx);
      drawFlat(ctx, w, h, colors);
    };

    const analyser = playing ? getPlayer().getAnalyser() : null;
    if (!analyser) {
      drawIdle();
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      const { w, h } = fit(canvas, ctx);
      drawBars(ctx, w, h, barLevels(bins), colors);
    };

    if (reduceMotion) {
      draw();
      const id = window.setInterval(draw, 1000 / REDUCED_FPS);
      return () => {
        window.clearInterval(id);
        drawIdle();
      };
    }

    let raf = 0;
    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      drawIdle();
    };
  }, [playing, reduceMotion, look]);

  return (
    <canvas
      ref={ref}
      className={styles.waves}
      width={FALLBACK_W}
      height={FALLBACK_H}
      aria-hidden="true"
      data-playing={playing}
    />
  );
}

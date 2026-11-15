export const BARS = 24;
export const REDUCED_FPS = 4; // with reduced motion the bars still answer the sound, just rarely
// Above about 8 kHz this music is near silent, so that part is left out.
const USABLE_SHARE = 0.4;
// Group widths grow with frequency by this power: more bars for the low end, where the music is.
const SPREAD = 1.6;
const PEAK = 0.8; // bars this loud get an accent cap, like a peak light on a meter
const GAP = 2;
const LINE = 2;

export interface WaveColors {
  ink: string;
  accent: string;
}

export function barLevels(bins: ArrayLike<number>, count = BARS): number[] {
  const usable = Math.max(count, Math.floor(bins.length * USABLE_SHARE));
  const levels: number[] = [];

  let from = 0;
  for (let i = 0; i < count; i++) {
    // At least one bin per bar, each bin in one bar only: the narrow low groups take the next bins in turn.
    const to = Math.max(from + 1, Math.floor(usable * ((i + 1) / count) ** SPREAD));

    let peak = 0;
    for (let k = from; k < to && k < bins.length; k++) {
      peak = Math.max(peak, bins[k]);
    }

    levels.push(peak / 255);
    from = to;
  }

  return levels;
}

export function drawFlat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: WaveColors,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(0, Math.round(h / 2 - LINE / 2), w, LINE);
}

export function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: readonly number[],
  colors: WaveColors,
): void {
  drawFlat(ctx, w, h, colors);

  const n = levels.length;
  if (!n) return;

  const barW = Math.max(1, Math.floor((w - GAP * (n - 1)) / n));
  const mid = h / 2;

  levels.forEach((level, i) => {
    const half = Math.max(LINE / 2, Math.round(level * (mid - 1)));
    const x = i * (barW + GAP);

    ctx.fillStyle = colors.ink;
    ctx.fillRect(x, mid - half, barW, half * 2);

    if (level >= PEAK) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x, mid - half, barW, LINE);
      ctx.fillRect(x, mid + half - LINE, barW, LINE);
    }
  });
}

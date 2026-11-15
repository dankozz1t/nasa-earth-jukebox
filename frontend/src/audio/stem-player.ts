export type Repeat = "off" | "one" | "all";

// Position is deliberately absent: it changes every frame, so read `player.position` in a rAF loop.
export interface PlayerSnapshot {
  playing: boolean;
  ready: boolean;
  duration: number;
  tag: unknown;
}

const SWAP_SEC = 0.3;
const ANALYSER_FFT = 256;
const TAIL_FADE_SEC = 2.5;

interface Deck {
  buffers: Map<string, AudioBuffer>;
  gains: Map<string, GainNode>;
  out: GainNode;
  sources: AudioBufferSourceNode[];
  duration: number;
  tag: unknown;
}

export class StemPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private analyser: AnalyserNode | null = null;
  private volume = 0.7;
  private enabled = new Map<string, boolean>();
  private cur: Deck | null = null;
  private next: Deck | null = null;
  private nextAt = 0;
  private nextScheduled = false;
  private nextToken = 0;
  private fading = new Set<Deck>();
  private origin = 0;
  private offset = 0;
  private _playing = false;
  private _loop = false;
  private repeat: Repeat = "off";
  private timer = 0;
  private posRev = 0;

  onAdvance: ((tag: unknown) => void) | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PlayerSnapshot = { playing: false, ready: false, duration: 0, tag: null };

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  // useSyncExternalStore needs the same object until a field actually changes.
  getSnapshot = (): PlayerSnapshot => this.snapshot;

  // Bumps when the paused position moves (seek, stop, loop toggle), so usePosition can re-render.
  getPositionRev = (): number => this.posRev;

  private notifyPosition(): void {
    this.posRev++;
    for (const cb of [...this.listeners]) cb();
  }

  private notify(): void {
    const playing = this._playing;
    const ready = this.ready;
    const duration = this.duration;
    const tag = this.cur?.tag ?? null;
    const s = this.snapshot;
    const unchanged =
      s.playing === playing && s.ready === ready && s.duration === duration && s.tag === tag;
    if (unchanged) return;

    this.snapshot = { playing, ready, duration, tag };
    for (const cb of [...this.listeners]) cb();
  }

  get playing(): boolean {
    return this._playing;
  }

  get ready(): boolean {
    return this.cur !== null && this.cur.buffers.size > 0;
  }

  // Length of the scan; the stems run a few seconds longer for the reverb tail.
  get duration(): number {
    return this.cur?.duration ?? 0;
  }

  private audio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = StemPlayer.curve(this.volume);
      this.panner = this.ctx.createStereoPanner();

      // The analyser sits in line (not as a side branch) so every browser keeps it running.
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = ANALYSER_FFT;
      this.analyser.smoothingTimeConstant = 0.75;
      this.master.connect(this.analyser).connect(this.panner).connect(this.ctx.destination);
      // After an interruption the clock may already be past the boundary.
      this.ctx.onstatechange = () => this.poll();
    }
    return this.ctx;
  }

  private async decode(stems: Record<string, ArrayBuffer>): Promise<Map<string, AudioBuffer>> {
    const ctx = this.audio();
    const decoded = await Promise.all(
      Object.entries(stems).map(
        async ([key, bytes]) => [key, await ctx.decodeAudioData(bytes.slice(0))] as const,
      ),
    );
    return new Map(decoded);
  }

  private makeDeck(buffers: Map<string, AudioBuffer>, duration: number, tag: unknown): Deck {
    const ctx = this.audio();
    const out = ctx.createGain();
    out.connect(this.master!);

    const gains = new Map<string, GainNode>();
    for (const key of buffers.keys()) {
      if (!this.enabled.has(key)) this.enabled.set(key, true);
      const g = ctx.createGain();
      g.gain.value = this.enabled.get(key) ? 1 : 0;
      g.connect(out);
      gains.set(key, g);
    }

    return { buffers, gains, out, sources: [], duration, tag };
  }

  async load(
    stems: Record<string, ArrayBuffer>,
    duration: number,
    tag: unknown = null,
    opts: { restart?: boolean; stale?: () => boolean } = {},
  ): Promise<boolean> {
    // A next deck still decoding was queued for the piece before this one and must not land.
    this.nextToken++;
    const buffers = await this.decode(stems);
    this.poll();
    if (opts.stale?.()) return false;

    const ctx = this.audio();
    const old = this.cur;
    const wasPlaying = this._playing;
    const fraction =
      old && old.duration ? Math.min(Math.max(0, this.position) / old.duration, 0.999) : 0;
    const at = opts.restart ? 0 : fraction * duration;

    if (this.repeat === "one") this.clearNext();
    else this.cancelNext();

    const deck = this.makeDeck(buffers, duration, tag);
    this.cur = deck;

    if (wasPlaying) {
      if (old) this.retire(old, ctx.currentTime, SWAP_SEC);
      this.startDeck(deck, ctx.currentTime, at, true);
      this.origin = ctx.currentTime - at;
    } else {
      if (old) this.dispose(old);
      this.offset = at;
    }

    if (this.repeat === "one") this.queueSame();
    else this.scheduleNext();

    this.notify();
    return true;
  }

  // Resolves false (and queues nothing) when a newer setNext, load or clearNext came while it decoded.
  async setNext(
    stems: Record<string, ArrayBuffer>,
    duration: number,
    tag: unknown,
  ): Promise<boolean> {
    const token = ++this.nextToken;
    const buffers = await this.decode(stems);
    if (token !== this.nextToken) return false;

    this.poll();
    this.clearNext();
    this.next = this.makeDeck(buffers, duration, tag);
    this.scheduleNext();
    return true;
  }

  clearNext(): void {
    this.nextToken++; // drops a setNext that is still decoding
    this.cancelNext();
    if (this.next) this.dispose(this.next);
    this.next = null;
    this.notify();
  }

  setRepeat(mode: Repeat): void {
    this.repeat = mode;
    this.clearNext();
    if (mode === "one") this.queueSame();
  }

  get position(): number {
    if (!this._playing || !this.ctx) return this.offset;
    const p = this.ctx.currentTime - this.origin;
    return this._loop && this.duration > 0 ? p % this.duration : p;
  }

  poll(): void {
    if (!this.nextScheduled || !this.ctx || !this.cur || !this.next) return;
    if (this.ctx.currentTime < this.nextAt) {
      // The audio clock can lag the wall clock (iOS, Bluetooth, output change): check again later.
      this.armPoll();
      return;
    }

    const old = this.cur;
    const deck = this.next;
    this.cur = deck;
    this.origin = this.nextAt;
    this.next = null;
    this.nextScheduled = false;
    window.clearTimeout(this.timer);
    this.retire(old, this.nextAt, TAIL_FADE_SEC);

    if (this.repeat === "one") this.queueSame();
    this.notify();
    this.onAdvance?.(deck.tag);
  }

  async play(): Promise<void> {
    if (!this.ready || this._playing) return;
    await this.audio().resume();
    if (this.offset >= this.duration) this.offset = 0;
    this.start(false);
    this.notify();
  }

  pause(): void {
    if (!this._playing) return;
    this.poll();
    this.offset = this.position;
    this.stopAll();
    this.notify();
  }

  stop(): void {
    this.stopAll();
    this.offset = 0;
    this.notify();
    this.notifyPosition();
  }

  seek(seconds: number): void {
    this.poll();
    const wasPlaying = this._playing;
    this.stopAll();
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) this.start(false);
    this.notify();
    this.notifyPosition();
  }

  setLoop(on: boolean): void {
    if (on === this._loop) return;
    const p = this.position;
    const wasPlaying = this._playing;
    this.stopAll();
    this._loop = on;
    this.offset = this.duration ? p % this.duration : p;
    if (wasPlaying) this.start(false);
    this.notify();
    this.notifyPosition();
  }

  setEnabled(key: string, on: boolean): void {
    this.enabled.set(key, on);
    if (!this.ctx) return;
    for (const deck of [this.cur, this.next, ...this.fading]) {
      const g = deck?.gains.get(key);
      if (g) g.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    }
  }

  // Perceptual curve so the slider feels even; 1.0 is +6 dB over the rendered level.
  static curve(v: number): number {
    const x = Math.max(0, Math.min(1, v));
    return x * x * 2;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (!this.master || !this.ctx) return;

    this.master.gain.setTargetAtTime(StemPlayer.curve(v), this.ctx.currentTime, 0.05);
  }

  // Extra voices (the map probe) join after the per-stem gains, before volume and pan.
  input(): { ctx: AudioContext; node: AudioNode } {
    const ctx = this.audio();
    return { ctx, node: this.master! };
  }

  // Never creates the audio graph: it may only appear after a user gesture (autoplay rule).
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  setPan(value: number): void {
    if (!this.panner || !this.ctx) return;
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), this.ctx.currentTime, 0.04);
  }

  suspend(): void {
    this.pause();
  }

  async spot(time: number, weights: Record<string, number>): Promise<void> {
    if (!this.ready) return;

    const ctx = this.audio();
    await ctx.resume();

    const now = ctx.currentTime;
    const start = Math.max(0, time - 0.15);
    const length = 1.1;

    for (const [key, buffer] of this.cur!.buffers) {
      const w = weights[key] ?? 0;
      if (w <= 0 || !this.enabled.get(key)) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(Math.min(1.6, w), now + 0.08);
      env.gain.setTargetAtTime(0, now + length - 0.4, 0.15);

      src.connect(env).connect(this.master!);
      src.start(now, Math.min(start, buffer.duration - 0.05), length);
    }
  }

  private start(fadeIn: boolean): void {
    const ctx = this.audio();
    this.startDeck(this.cur!, ctx.currentTime, this.offset, fadeIn);
    this.origin = ctx.currentTime - this.offset;
    this._playing = true;
    this.scheduleNext();
  }

  private queueSame(): void {
    if (!this.cur) return;
    this.next = this.makeDeck(this.cur.buffers, this.cur.duration, this.cur.tag);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this._playing || !this.cur || !this.next || this.nextScheduled || this._loop) return;

    const ctx = this.audio();
    const when = Math.max(this.origin + this.cur.duration, ctx.currentTime + 0.05);
    this.startDeck(this.next, when, 0, true);

    const g = this.cur.out.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(1, when);
    g.linearRampToValueAtTime(0, when + TAIL_FADE_SEC);

    this.nextAt = when;
    this.nextScheduled = true;
    this.armPoll();
  }

  private armPoll(): void {
    window.clearTimeout(this.timer);
    const wait = Math.max(0, (this.nextAt - this.ctx!.currentTime) * 1000) + 20;
    this.timer = window.setTimeout(() => this.poll(), wait);
  }

  private cancelNext(): void {
    if (!this.nextScheduled) return;

    window.clearTimeout(this.timer);
    this.nextScheduled = false;
    if (this.next) this.stopDeck(this.next);

    if (this.cur && this.ctx) {
      const g = this.cur.out.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(1, now + 0.05);
    }
  }

  private startDeck(deck: Deck, when: number, offset: number, fadeIn: boolean): void {
    const ctx = this.audio();
    this.stopDeck(deck);

    const g = deck.out.gain;
    g.cancelScheduledValues(0);
    if (fadeIn) {
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(1, when + SWAP_SEC);
    } else {
      g.setValueAtTime(1, when);
    }

    for (const [key, buffer] of deck.buffers) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (this._loop) {
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = deck.duration;
      }

      src.connect(deck.gains.get(key)!);
      src.start(when, Math.min(offset, buffer.duration - 0.01));
      deck.sources.push(src);
    }
  }

  private stopDeck(deck: Deck): void {
    for (const s of deck.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    deck.sources = [];
  }

  private retire(deck: Deck, from: number, sec: number): void {
    const ctx = this.audio();
    const g = deck.out.gain;

    if (from <= ctx.currentTime) {
      g.cancelScheduledValues(0);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0, ctx.currentTime + sec);
    }

    this.fading.add(deck);
    const wait = Math.max(0, from + sec - ctx.currentTime) * 1000 + 150;
    window.setTimeout(() => {
      if (this.fading.delete(deck)) this.dispose(deck);
    }, wait);
  }

  private dispose(deck: Deck): void {
    this.stopDeck(deck);
    for (const g of deck.gains.values()) g.disconnect();
    deck.out.disconnect();
  }

  private stopAll(): void {
    this.cancelNext();
    if (this.cur) this.stopDeck(this.cur);
    for (const deck of this.fading) this.dispose(deck);
    this.fading.clear();
    this._playing = false;
  }
}

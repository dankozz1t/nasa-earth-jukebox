// The map probe: a small synth that sounds the weather value under the pointer or keyboard cursor.
// Pitch snaps to a pentatonic scale, so moving the pointer plays gentle steps, not a siren.

import type { SectionKey } from "../shared/api/weather";

// D, A, F, G: the same keys as the sound service sections.
const TONIC_MIDI: Record<SectionKey, number> = {
  temperature: 50,
  precipitation: 45,
  clouds: 53,
  wind: 43,
};
const PENTATONIC = [0, 2, 4, 7, 9];
const STEPS = PENTATONIC.length * 2;

export function probePitch(section: SectionKey, level: number): number {
  const step = Math.min(STEPS, Math.max(0, Math.round(level * STEPS)));
  const octave = Math.floor(step / PENTATONIC.length);
  const degree = PENTATONIC[step % PENTATONIC.length];

  return TONIC_MIDI[section] + 12 * octave + degree + 12;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function textureLevel(section: SectionKey, level: number): number {
  if (section === "precipitation") return 0.35 * level;
  if (section === "wind") return 0.3 * level;
  return 0;
}

export class ProbeVoice {
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private filter: BiquadFilterNode;
  private tone: GainNode;
  private noise: AudioBufferSourceNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private pan: StereoPannerNode;
  private out: GainNode;
  private lastPitch = -1;
  private stopTimer = 0;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.out.connect(this.pan).connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 0.4;
    this.tone = ctx.createGain();
    this.tone.gain.value = 0.22;
    this.filter.connect(this.tone).connect(this.out);

    this.oscA = ctx.createOscillator();
    this.oscA.type = "sine";
    this.oscB = ctx.createOscillator();
    this.oscB.type = "triangle";
    this.oscB.detune.value = 6;

    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    this.oscA.connect(this.filter);
    this.oscB.connect(bGain).connect(this.filter);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.out);

    this.oscA.start();
    this.oscB.start();
    this.noise.start();
  }

  play(section: SectionKey, level: number, pan: number): void {
    window.clearTimeout(this.stopTimer);

    const now = this.ctx.currentTime;
    const pitch = probePitch(section, level);

    if (pitch !== this.lastPitch) {
      this.oscA.frequency.setTargetAtTime(hz(pitch), now, 0.03);
      this.oscB.frequency.setTargetAtTime(hz(pitch), now, 0.03);
      this.tone.gain.cancelScheduledValues(now);
      this.tone.gain.setTargetAtTime(0.3, now, 0.02);
      this.tone.gain.setTargetAtTime(0.2, now + 0.12, 0.15);
      this.lastPitch = pitch;
    }

    this.filter.frequency.setTargetAtTime(700 + 1600 * level, now, 0.08);

    const isWind = section === "wind";
    this.noiseFilter.frequency.setTargetAtTime(isWind ? 500 : 2500, now, 0.1);
    this.noiseFilter.Q.value = isWind ? 0.6 : 1.2;
    this.noiseGain.gain.setTargetAtTime(textureLevel(section, level), now, 0.1);

    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.05);
    this.out.gain.setTargetAtTime(0.9, now, 0.04);

    // Fades out by itself when the pointer stops moving.
    this.stopTimer = window.setTimeout(() => this.release(), 1200);
  }

  release(): void {
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.18);
    this.lastPitch = -1;
  }
}

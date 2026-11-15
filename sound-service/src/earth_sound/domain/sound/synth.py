"""Synthesis of a score into one mono stem per layer plus the bed.

Deterministic (fixed noise seed). All stems share one reverb and master gain,
so muting a layer is just leaving its stem out.
"""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from earth_sound.domain.aerosols.layers import BED_KEY, LAYERS, Voice
from earth_sound.domain.music.score import NoteEvent, Score

F32 = npt.NDArray[np.float32]
F64 = npt.NDArray[np.float64]

TAIL_SEC = 5.0
TARGET_PEAK = 0.5  # calm default level, the player volume goes up from here
SOFTEN_HZ = 4200.0  # high-cut so nothing is sharp in headphones


@dataclass(frozen=True, slots=True)
class SynthSettings:
    sample_rate: int = 22_050
    reverb_sec: float = 3.5
    reverb_wet: float = 0.38
    seed: int = 5669


@dataclass(frozen=True, slots=True)
class Envelope:
    attack: float
    decay: float
    sustain: float
    release: float


ENVELOPES: dict[Voice, Envelope] = {
    Voice.SMOKE: Envelope(0.7, 0.4, 0.6, 2.8),
    Voice.PAD: Envelope(1.2, 0.5, 0.7, 3.2),
    Voice.AIR: Envelope(0.9, 0.3, 0.8, 3.6),
    Voice.BELL: Envelope(0.02, 1.4, 0.0, 2.2),  # slower onset, no metallic click
}
LAYER_GAIN: dict[Voice, float] = {Voice.SMOKE: 0.18, Voice.PAD: 0.30, Voice.AIR: 0.22, Voice.BELL: 0.11}
BED_ENVELOPE = Envelope(3.0, 1.0, 0.8, 4.0)
BED_GAIN = 0.22


def midi_to_hz(pitch: int) -> float:
    return float(440.0 * 2.0 ** ((pitch - 69) / 12.0))


def adsr(env: Envelope, hold: float, sr: int) -> F64:
    """Attack-decay-sustain over `hold` seconds, then release."""
    hold = max(hold, 0.05)
    n_hold = int(hold * sr)
    n_rel = int(env.release * sr)
    t = np.arange(n_hold) / sr
    a = max(env.attack, 1e-4)
    level = np.where(
        t < a,
        t / a,
        env.sustain + (1.0 - env.sustain) * np.exp(-(t - a) / max(env.decay, 1e-3) * 3.0),
    )
    end = float(level[-1]) if n_hold else 0.0
    release = end * np.exp(-np.arange(n_rel) / sr / max(env.release, 1e-3) * 5.0)
    return np.concatenate([level, release])


def _oscillator(voice: Voice, freq: float, t: F64, rng: np.random.Generator) -> F64:
    two_pi_t = 2.0 * np.pi * t
    if voice is Voice.SMOKE:
        # three detuned saws, 5 harmonics with a steep roll-off: smoky, not buzzy
        out = np.zeros_like(t)
        for detune in (-0.004, 0.0, 0.005):
            f = freq * (1.0 + detune)
            phase = rng.uniform(0, 2 * np.pi)
            for n in range(1, 6):
                out += np.sin(two_pi_t * f * n + phase * n) / n**1.8
        return out / 3.2
    if voice is Voice.PAD:
        # detuned triangles, odd harmonics falling as 1/n^2
        out = np.zeros_like(t)
        for detune in (-0.004, 0.004):
            f = freq * (1.0 + detune)
            for i, n in enumerate((1, 3, 5, 7)):
                out += ((-1) ** i) * np.sin(two_pi_t * f * n) / (n * n)
        return out / 1.6
    if voice is Voice.AIR:
        return np.sin(two_pi_t * freq) + 0.18 * np.sin(two_pi_t * freq * 2.0)
    # bell: FM with a harmonic ratio and a small decaying index, glassy not clangy
    index = 3.0 * np.exp(-t / 0.5)
    return np.sin(two_pi_t * freq + index * np.sin(two_pi_t * freq * 2.0))


def _render_notes(
    notes: tuple[NoteEvent, ...] | list[NoteEvent],
    voice: Voice | None,
    env: Envelope,
    gain: float,
    length: int,
    sr: int,
    rng: np.random.Generator,
) -> F64:
    out = np.zeros(length)
    for note in notes:
        amp_env = adsr(env, note.duration, sr)
        t = np.arange(len(amp_env)) / sr
        freq = midi_to_hz(note.pitch)
        if voice is None:  # bed: sine plus a soft octave
            wave = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
        else:
            wave = _oscillator(voice, freq, t, rng)
        amp = gain * (note.velocity / 127.0) ** 1.5
        start = int(note.time * sr)
        end = min(length, start + len(wave))
        if end > start:
            out[start:end] += (wave * amp_env * amp)[: end - start]
    return out


def _surf(score: Score, length: int, sr: int, rng: np.random.Generator) -> F64:
    """Pink-ish band-limited noise that follows the sea salt strength."""
    sea = next(i for i, layer in enumerate(LAYERS) if layer.voice is Voice.AIR)
    white = rng.standard_normal(length)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(length, 1.0 / sr)
    shape = np.where((freqs > 150) & (freqs < 1400), 1.0 / np.sqrt(np.maximum(freqs, 1.0)), 0.0)
    noise = np.fft.irfft(spectrum * shape, n=length)
    noise /= max(float(np.abs(noise).max()), 1e-9)
    times = (np.arange(score.bins) + 0.5) * score.step_sec
    levels = np.array([0.03 + 0.97 * s.strength[sea] if s.strength[sea] > 0 else 0.0 for s in score.steps])
    t = np.arange(length) / sr
    level = np.interp(t, times, levels, left=levels[0], right=0.0)
    swell = 0.65 + 0.35 * np.sin(2 * np.pi * 0.09 * t)  # slow wave-like swell
    return noise * level * swell * 0.035


def _reverb_ir(settings: SynthSettings, rng: np.random.Generator) -> F64:
    n = int(settings.reverb_sec * settings.sample_rate)
    t = np.arange(n) / settings.sample_rate
    ir = rng.standard_normal(n) * np.exp(-t / (settings.reverb_sec / 6.9))
    ir[: int(0.03 * settings.sample_rate)] = 0.0  # pre-delay
    return ir / np.sqrt(float((ir**2).sum()))


def soften(signal: F64, sr: int, cutoff: float = SOFTEN_HZ) -> F64:
    """High-cut in the frequency domain, roughly second order."""
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(len(signal), 1.0 / sr)
    return np.fft.irfft(spectrum / (1.0 + (freqs / cutoff) ** 4) ** 0.5, n=len(signal))


def _convolve(signal: F64, ir: F64) -> F64:
    size = 1 << int(np.ceil(np.log2(len(signal) + len(ir) - 1)))
    wet = np.fft.irfft(np.fft.rfft(signal, size) * np.fft.rfft(ir, size), size)
    return wet[: len(signal)]


def render_stems(score: Score, settings: SynthSettings | None = None) -> dict[str, F32]:
    """One mono float32 stem per layer key and the bed, all under one master gain."""
    settings = settings or SynthSettings()
    sr = settings.sample_rate
    length = int((score.duration_sec + TAIL_SEC) * sr)
    rng = np.random.default_rng(settings.seed)
    ir = _reverb_ir(settings, rng)

    dry: dict[str, F64] = {}
    for k, layer in enumerate(LAYERS):
        layer_notes = [n for n in score.notes if n.layer == k]
        env, gain = ENVELOPES[layer.voice], LAYER_GAIN[layer.voice]
        stem = _render_notes(layer_notes, layer.voice, env, gain, length, sr, rng)
        if layer.voice is Voice.AIR:
            stem += _surf(score, length, sr, rng)
        dry[layer.key] = stem
    dry[BED_KEY] = _render_notes(score.bed, None, BED_ENVELOPE, BED_GAIN, length, sr, rng)

    wet = {
        key: soften((1.0 - settings.reverb_wet) * s + settings.reverb_wet * 3.0 * _convolve(s, ir), sr)
        for key, s in dry.items()
    }
    mix_peak = float(np.abs(np.sum(list(wet.values()), axis=0)).max())
    master = TARGET_PEAK / mix_peak if mix_peak > 1e-9 else 1.0
    fade = np.ones(length)
    fade_len = int(0.5 * sr)
    fade[-fade_len:] = np.linspace(1.0, 0.0, fade_len)
    return {key: (s * master * fade).astype(np.float32) for key, s in wet.items()}


def mix(stems: dict[str, F32], keys: tuple[str, ...] | list[str]) -> F32:
    """Sum of the chosen stems, clipped to [-1, 1]. A subset can peak higher than the full mix."""
    selected = [stems[k] for k in keys if k in stems]
    if not selected:
        length = len(next(iter(stems.values()))) if stems else 0
        return np.zeros(length, dtype=np.float32)
    return np.clip(np.sum(selected, axis=0), -1.0, 1.0).astype(np.float32)

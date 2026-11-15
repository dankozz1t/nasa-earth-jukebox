"""Instruments in plain NumPy. Each function returns one note with its envelope and release tail."""

from collections.abc import Callable

import numpy as np
import numpy.typing as npt

F64 = npt.NDArray[np.float64]


def hz(pitch: int) -> float:
    return float(440.0 * 2.0 ** ((pitch - 69) / 12.0))


def _t(seconds: float, sr: int) -> F64:
    return np.arange(max(1, int(seconds * sr))) / sr


def _attack(t: F64, seconds: float) -> F64:
    return np.asarray(np.clip(t / max(seconds, 1e-4), 0.0, 1.0), dtype=np.float64)


def _release(t: F64, hold: float, seconds: float) -> F64:
    """1 until `hold`, then an exponential fade over `seconds`."""
    return np.asarray(np.where(t < hold, 1.0, np.exp(-(t - hold) / max(seconds, 1e-3) * 4.0)), dtype=np.float64)


def piano(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(dur + 1.6, sr)
    out = np.zeros_like(t)
    b = 0.0004  # stiff-string inharmonicity
    for n in range(1, 9):
        fn = n * f * np.sqrt(1 + b * n * n)
        if fn > sr / 2.2:
            break
        out += np.sin(2 * np.pi * fn * t) / n**1.1 * np.exp(-t * (0.9 + 0.55 * n))
    return out * _attack(t, 0.004) * _release(t, dur, 0.5) * 0.45


def strings(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(dur + 1.5, sr)
    vibrato = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6))
    out = np.zeros_like(t)
    for detune in (-0.005, 0.0, 0.006):
        phase = 2 * np.pi * f * (1 + detune) * np.cumsum(vibrato) / sr
        for n in range(1, 10):
            if n * f > sr / 2.2:
                break
            out += np.sin(n * phase) / n * np.exp(-n / 3.5)
    return out / 3.0 * _attack(t, 0.6) * _release(t, dur, 1.2) * 0.35


def bass(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(dur + 0.6, sr)
    out = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return out * _attack(t, 0.01) * np.exp(-t * 0.9) * _release(t, dur, 0.25) * 0.6


def marimba(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(min(dur, 0.6) + 1.0, sr)
    out = np.sin(2 * np.pi * f * t) * np.exp(-t * 4.5) + 0.3 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 18)
    return out * _attack(t, 0.002) * 0.5


def harp(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(min(dur, 1.0) + 1.8, sr)
    out = np.zeros_like(t)
    for n in range(1, 7):
        if n * f > sr / 2.2:
            break
        out += np.sin(2 * np.pi * n * f * t) / (n * n) * np.exp(-t * (0.9 + 0.8 * n))
    return out * _attack(t, 0.002) * 0.55


def flute(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(dur + 0.5, sr)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    phase = 2 * np.pi * f * np.cumsum(vib) / sr
    tone = np.sin(phase) + 0.15 * np.sin(2 * phase) + 0.05 * np.sin(3 * phase)
    breath = np.convolve(rng.standard_normal(len(t)), np.ones(8) / 8, mode="same") * 0.05
    return (tone + breath) * _attack(t, 0.08) * _release(t, dur, 0.18) * 0.38


def bell(pitch: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    f = hz(pitch)
    t = _t(2.8, sr)
    index = 6.0 * np.exp(-t / 0.7)
    out = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * 3.5 * t))
    return out * _attack(t, 0.002) * np.exp(-t * 1.4) * 0.3


def percussion(kind: int, dur: float, sr: int, rng: np.random.Generator) -> F64:
    if kind == 2:  # rim
        t = _t(0.12, sr)
        return np.sin(2 * np.pi * 1250 * t) * np.exp(-t * 60) * 0.35
    t = _t(0.12, sr)  # shaker
    noise = rng.standard_normal(len(t))
    bright = np.diff(noise, prepend=0.0)
    return bright * _attack(t, 0.004) * np.exp(-t * 45) * 0.12


INSTRUMENTS: dict[str, Callable[[int, float, int, np.random.Generator], F64]] = {
    "piano": piano,
    "strings": strings,
    "bass": bass,
    "marimba": marimba,
    "harp": harp,
    "flute": flute,
    "bell": bell,
    "shaker": percussion,
}


def band_noise(length: int, sr: int, low: float, high: float, rng: np.random.Generator) -> F64:
    """Band-limited noise, peak-normalized."""
    spectrum = np.fft.rfft(rng.standard_normal(length))
    freqs = np.fft.rfftfreq(length, 1.0 / sr)
    shaped = np.fft.irfft(spectrum * ((freqs >= low) & (freqs <= high)) / np.sqrt(np.maximum(freqs, 1.0)), n=length)
    return shaped / max(float(np.abs(shaped).max()), 1e-9)


def rain_texture(level: F64, sr: int, rng: np.random.Generator) -> F64:
    """Hiss plus random drops, both following the precipitation level."""
    n = len(level)
    hiss = band_noise(n, sr, 900, 7000, rng) * 0.25
    drops = np.zeros(n)
    count = int(n / sr * 30)
    for pos in rng.integers(0, n, size=count):
        if rng.random() < level[pos] ** 0.8:
            k = np.arange(min(int(0.04 * sr), n - pos))
            pitch = rng.uniform(1800, 4200)
            drops[pos : pos + len(k)] += np.sin(2 * np.pi * pitch * k / sr) * np.exp(-k / sr * 90) * 0.4
    return (hiss * level**1.2 + drops) * 0.5


def wind_texture(level: F64, sr: int, rng: np.random.Generator) -> F64:
    """Low band noise, loudness follows the wind level with a slow swell."""
    n = len(level)
    t = np.arange(n) / sr
    whoosh = band_noise(n, sr, 120, 900, rng)
    swell = 0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t) * np.sin(2 * np.pi * 0.043 * t + 1.3)
    return whoosh * level**1.3 * swell * 0.4

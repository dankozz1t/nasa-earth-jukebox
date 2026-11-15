"""Render a weather arrangement: mono stems plus a stereo mix.

The mix pans with the sine path, north left and south right (equal power). Stems stay mono, the browser pans them live.
"""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from earth_sound.domain.sound.instruments import INSTRUMENTS, rain_texture, wind_texture
from earth_sound.domain.sound.synth import soften
from earth_sound.domain.weather.arrange import Arrangement
from earth_sound.domain.weather.path import SinePath, pan_for_latitude

F32 = npt.NDArray[np.float32]
F64 = npt.NDArray[np.float64]

TAIL_SEC = 4.0
TARGET_PEAK = 0.55  # calm default level, the player volume goes up from here
PART_GAIN = {
    "lead": 0.9,
    "strings": 0.55,
    "bass": 0.6,
    "arpeggio": 0.45,
    "bells": 0.35,
    "percussion": 0.5,
    "texture": 0.55,
}
PART_WET = {
    "lead": 0.28,
    "strings": 0.45,
    "bass": 0.12,
    "arpeggio": 0.32,
    "bells": 0.5,
    "percussion": 0.15,
    "texture": 0.25,
}


@dataclass(frozen=True, slots=True)
class WeatherAudio:
    stems: dict[str, F32]  # part -> mono samples
    mix: F32  # 2 x n stereo
    sample_rate: int


def _reverb(signal: F64, sr: int, rng: np.random.Generator, seconds: float = 2.8) -> F64:
    n = int(seconds * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6.9))
    ir[: int(0.025 * sr)] = 0.0
    ir /= np.sqrt(float((ir**2).sum()))
    size = 1 << int(np.ceil(np.log2(len(signal) + n - 1)))
    return np.fft.irfft(np.fft.rfft(signal, size) * np.fft.rfft(ir, size), size)[: len(signal)]


def render_weather(
    arrangement: Arrangement,
    path: SinePath,
    level_curve: tuple[F64, F64] | None,
    texture: str | None,
    sr: int = 22_050,
    seed: int = 5669,
) -> WeatherAudio:
    rng = np.random.default_rng(seed)
    length = int((arrangement.duration_sec + TAIL_SEC) * sr)
    dry: dict[str, F64] = {}
    for part, instrument in arrangement.instruments.items():
        render = INSTRUMENTS[instrument]
        buf = np.zeros(length)
        for note in (n for n in arrangement.notes if n.part == part):
            wave = render(note.pitch, note.duration, sr, rng) * note.velocity
            start = int(note.time * sr)
            end = min(length, start + len(wave))
            if end > start:
                buf[start:end] += wave[: end - start]
        dry[part] = buf * PART_GAIN[part]

    if texture and level_curve is not None:
        times = np.arange(length) / sr / arrangement.duration_sec
        level = np.interp(times, level_curve[0], level_curve[1], left=level_curve[1][0], right=0.0)
        tex = rain_texture(level, sr, rng) if texture == "rain" else wind_texture(level, sr, rng)
        dry["texture"] = tex * PART_GAIN["texture"]

    wet = {k: soften((1 - PART_WET[k]) * s + PART_WET[k] * 2.2 * _reverb(s, sr, rng), sr) for k, s in dry.items()}

    # past the end of the scan the pan keeps its last position
    t = np.clip(np.arange(length) / sr / arrangement.duration_sec, 0.0, 1.0)
    pan = pan_for_latitude(path.latitude(t))
    angle = (pan + 1) * np.pi / 4
    left_gain, right_gain = np.cos(angle), np.sin(angle)
    mono_mix = np.sum(list(wet.values()), axis=0)
    stereo = np.stack([mono_mix * left_gain, mono_mix * right_gain])

    # at the centre a mono stem is louder than either stereo channel, so normalize against both
    peak = max(float(np.abs(stereo).max()), float(np.abs(mono_mix).max()))
    master = TARGET_PEAK / peak if peak > 1e-9 else 1.0
    fade = np.ones(length)
    fade[-int(0.5 * sr) :] = np.linspace(1.0, 0.0, int(0.5 * sr))
    return WeatherAudio(
        stems={k: (s * master * fade).astype(np.float32) for k, s in wet.items()},
        mix=(stereo * master * fade).astype(np.float32),
        sample_rate=sr,
    )


def pan_mix(
    stems: dict[str, F32], keys: list[str] | tuple[str, ...], path: SinePath, duration_sec: float, sr: int
) -> F32:
    chosen = [stems[k] for k in keys if k in stems]
    length = len(next(iter(stems.values()))) if stems else 0
    mono = np.sum(chosen, axis=0) if chosen else np.zeros(length)
    t = np.clip(np.arange(length) / sr / duration_sec, 0.0, 1.0)
    angle = (pan_for_latitude(path.latitude(t)) + 1) * np.pi / 4
    return np.clip(np.stack([mono * np.cos(angle), mono * np.sin(angle)]), -1.0, 1.0).astype(np.float32)

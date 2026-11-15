"""The four aerosol classes of the NASA SVS 5669 legend."""

from dataclasses import dataclass
from enum import StrEnum


class Voice(StrEnum):
    SMOKE = "smoke"  # detuned band-limited saws: black carbon
    PAD = "pad"  # warm triangle pad: dust
    AIR = "air"  # airy sine plus surf noise: sea salt
    BELL = "bell"  # FM bell: sulfate


@dataclass(frozen=True, slots=True)
class LayerSpec:
    key: str
    label: str
    color: str
    fallback_hue: int  # Pillow HSV hue, 0..255
    pitch_low: int
    pitch_high: int
    program: int  # General MIDI program, 0-based, for MIDI export
    pan: int
    voice: Voice
    voice_text: str
    about: str


LAYERS: tuple[LayerSpec, ...] = (
    LayerSpec(
        key="black_carbon",
        label="Black Carbon",
        color="#d2603f",
        fallback_hue=7,
        pitch_low=48,
        pitch_high=67,
        program=89,
        pan=48,
        voice=Voice.SMOKE,
        voice_text="low, smoky, slightly rough tone",
        about="Soot from fires and burning fuel. Big plumes mark wildfire and agricultural burning.",
    ),
    LayerSpec(
        key="dust",
        label="Dust",
        color="#c39adb",
        fallback_hue=199,
        pitch_low=55,
        pitch_high=79,
        program=88,
        pan=43,
        voice=Voice.PAD,
        voice_text="warm, slow pad",
        about="Mineral dust lifted from deserts. The Sahara plume crosses the Atlantic toward the Americas.",
    ),
    LayerSpec(
        key="sea_salt",
        label="Sea Salt",
        color="#84a9a8",
        fallback_hue=127,
        pitch_low=64,
        pitch_high=86,
        program=91,
        pan=88,
        voice=Voice.AIR,
        voice_text="airy high voice with ocean surf noise",
        about="Salt spray thrown up by wind over the oceans. It traces storms and the stormy Southern Ocean.",
    ),
    LayerSpec(
        key="sulfate",
        label="Sulfate",
        color="#52dc37",
        fallback_hue=74,
        pitch_low=55,
        pitch_high=76,
        program=94,
        pan=66,
        voice=Voice.BELL,
        voice_text="glassy bell",
        about="Sulfate particles from industry, power plants and volcanoes. Bright over industrial regions.",
    ),
)

LAYER_KEYS: tuple[str, ...] = tuple(layer.key for layer in LAYERS)
BED_KEY = "bed"
STEM_KEYS: tuple[str, ...] = (*LAYER_KEYS, BED_KEY)

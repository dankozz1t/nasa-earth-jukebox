import io
import wave

import numpy as np
import numpy.typing as npt


class WavEncoder:
    media_type = "audio/wav"

    def encode(self, samples: npt.NDArray[np.float32], sample_rate: int) -> bytes:
        """`samples` is (n,) for mono or (2, n) for stereo."""
        channels = 1 if samples.ndim == 1 else samples.shape[0]
        interleaved = samples if samples.ndim == 1 else samples.T.reshape(-1)
        pcm = (np.clip(interleaved, -1.0, 1.0) * 32767.0).astype("<i2")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as out:
            out.setnchannels(channels)
            out.setsampwidth(2)
            out.setframerate(sample_rate)
            out.writeframes(pcm.tobytes())
        return buffer.getvalue()

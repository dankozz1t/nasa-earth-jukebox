from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, File, Form, Path, Query, UploadFile
from fastapi.responses import Response

from earth_sound.adapters.inbound.http.renders import RenderGate
from earth_sound.adapters.inbound.http.schemas.soundscapes import SoundscapeOut, to_schema
from earth_sound.application.compose_soundscape.use_case import ComposeSoundscape
from earth_sound.application.get_artifact.use_case import Artifact, GetArtifact
from earth_sound.application.models.soundscape import ComposeCommand
from earth_sound.domain.music.score import Mode
from earth_sound.shared.errors import InvalidInputError

SoundscapeId = Annotated[str, Path(pattern=r"^[0-9a-f]{16}$")]
StemKey = Annotated[str, Path(pattern=r"^[a-z_]{1,32}$")]


@dataclass(frozen=True, slots=True)
class SoundscapeHandlers:
    compose: ComposeSoundscape
    artifacts: GetArtifact
    max_upload_bytes: int
    renders: RenderGate


async def _read_limited(upload: UploadFile, limit: int, name: str) -> bytes:
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise InvalidInputError(f"{name} is larger than {limit // (1024 * 1024)} MB")
    if not data:
        raise InvalidInputError(f"{name} is empty")
    return data


def _send(artifact: Artifact) -> Response:
    return Response(
        content=artifact.content,
        media_type=artifact.media_type,
        headers={
            "Content-Disposition": f'inline; filename="{artifact.filename}"',
            # the id hashes the inputs, so the bytes never change
            "Cache-Control": "public, max-age=86400, immutable",
        },
    )


def build_router(handlers: SoundscapeHandlers) -> APIRouter:
    router = APIRouter(prefix="/v1/soundscapes", tags=["soundscapes"])

    @router.post("", response_model=SoundscapeOut, response_model_by_alias=True)
    async def compose(
        image: Annotated[UploadFile, File(description="Aerosol frame: PNG, JPEG or WebP")],
        mode: Annotated[Mode, Form()] = Mode.HARMONY,
        duration_sec: Annotated[float, Form(ge=10, le=180)] = 64.0,
        sensitivity: Annotated[int, Form(ge=0, le=4)] = 2,
        source_label: Annotated[str, Form(max_length=200)] = "uploaded image",
        colorbar: Annotated[UploadFile | None, File(description="Legend image to calibrate hues")] = None,
    ) -> SoundscapeOut:
        command = ComposeCommand(
            image=await _read_limited(image, handlers.max_upload_bytes, "image"),
            colorbar=await _read_limited(colorbar, handlers.max_upload_bytes, "colorbar") if colorbar else None,
            mode=mode,
            duration_sec=duration_sec,
            sensitivity=sensitivity,
            source_label=source_label,
        )
        # CPU-bound: run off the event loop
        soundscape = await handlers.renders.run(handlers.compose, command)
        return to_schema(soundscape)

    @router.get("/{soundscape_id}/stems/{key}.wav")
    def stem(soundscape_id: SoundscapeId, key: StemKey) -> Response:
        return _send(handlers.artifacts.stem(soundscape_id, key))

    @router.get("/{soundscape_id}/mix.wav")
    def mix(
        soundscape_id: SoundscapeId,
        layers: Annotated[str | None, Query(max_length=100)] = None,
        bed: bool = True,
    ) -> Response:
        return _send(handlers.artifacts.mix(soundscape_id, layers, bed))

    @router.get("/{soundscape_id}/score.mid")
    def midi(
        soundscape_id: SoundscapeId,
        layers: Annotated[str | None, Query(max_length=100)] = None,
        bed: bool = True,
    ) -> Response:
        return _send(handlers.artifacts.midi(soundscape_id, layers, bed))

    @router.get("/{soundscape_id}/classmap.png")
    def class_map(soundscape_id: SoundscapeId) -> Response:
        return _send(handlers.artifacts.class_map(soundscape_id))

    return router

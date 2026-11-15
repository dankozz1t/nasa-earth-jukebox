"""Errors as RFC 9457 problem details."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from earth_sound.shared.errors import EarthSoundError, InvalidInputError, NotFoundError

STATUS = {InvalidInputError: 400, NotFoundError: 404}


def problem(status: int, title: str, detail: str, code: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"type": "about:blank", "title": title, "status": status, "detail": detail, "code": code},
        media_type="application/problem+json",
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(EarthSoundError)
    async def _domain_error(_: Request, exc: EarthSoundError) -> JSONResponse:
        status = next(
            (s for cls, s in STATUS.items() if isinstance(exc, cls)), 503 if exc.code == "weather_unavailable" else 500
        )
        title = {400: "Invalid input", 404: "Not found", 503: "Unavailable"}.get(status, "Error")
        return problem(status, title, exc.message, exc.code)

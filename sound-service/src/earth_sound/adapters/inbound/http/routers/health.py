from fastapi import APIRouter

from earth_sound import __version__


def build_router() -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return router

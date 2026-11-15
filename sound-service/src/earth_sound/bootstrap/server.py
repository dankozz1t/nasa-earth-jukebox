import logging

import uvicorn

from earth_sound.bootstrap.container import build_app
from earth_sound.bootstrap.settings import Settings


def serve() -> None:
    settings = Settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(build_app(settings), host=settings.host, port=settings.port, log_level=settings.log_level.lower())

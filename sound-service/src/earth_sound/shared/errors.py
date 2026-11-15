"""Error base shared by every layer."""


class EarthSoundError(Exception):
    code: str = "error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidInputError(EarthSoundError):
    """Bad image or parameter."""

    code = "invalid_input"


class NotFoundError(EarthSoundError):
    """Soundscape or artifact not in the store."""

    code = "not_found"

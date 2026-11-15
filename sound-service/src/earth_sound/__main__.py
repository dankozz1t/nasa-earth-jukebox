import sys

from earth_sound.bootstrap.server import serve


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command != "serve":
        print(f"unknown command: {command}; usage: python -m earth_sound serve", file=sys.stderr)  # noqa: T201
        return 2
    serve()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

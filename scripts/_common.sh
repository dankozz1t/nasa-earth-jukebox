# Sourced by the other scripts.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# compose reads .env (at the repository root) on its own; without it the defaults apply.
compose() {
  (cd "$ROOT_DIR" && docker compose -f "$ROOT_DIR/compose.yaml" "$@")
}

# Prints the script's header comment (the lines after the shebang) for -h/--help.
usage() {
  sed -n '2,/^[^#]/p' "$0" | sed -n 's/^# \{0,1\}//p'
}

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2" >&2; exit 1; }
}

need_docker() {
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (docker compose ...)." >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and try again." >&2; exit 1; }
}

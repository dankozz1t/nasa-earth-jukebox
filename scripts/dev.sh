#!/usr/bin/env bash
# Frontend with hot reload (Vite, http://localhost:5173) against the backend on :8080.
# Usage: scripts/dev.sh           start Vite; the backend must be up (scripts/start.sh is enough)
#        scripts/dev.sh --help    how to run all three parts by hand
set -euo pipefail
source "$(dirname "$0")/_common.sh"

manual() {
  cat <<'TEXT'
Run each part in its own terminal, from the repository root:

1. sound-service (Python 3.12+), http://127.0.0.1:8000/docs
   cd sound-service
   python3.12 -m venv .venv && .venv/bin/python -m pip install -e ".[dev]"   (macOS python3 is 3.9)
   .venv/bin/python -m earth_sound serve
   (Windows: .venv\Scripts\python instead of .venv/bin/python)

2. backend (.NET 10 SDK), http://localhost:8080/api/health
   cd backend
   dotnet run --project src/EarthJukebox.Api

3. frontend (Node.js 20+), http://localhost:5173
   scripts/dev.sh

Shortcut: scripts/start.sh runs 1 and 2 in Docker (backend on :8080), then scripts/dev.sh.
TEXT
}

case "${1:-}" in
  -h|--help|--print) manual; exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; manual; exit 1 ;;
esac

need npm "Install Node.js 22 LTS: https://nodejs.org/"
backend="${API_URL:-http://localhost:8080}"
status="$(curl -s -o /dev/null -w '%{http_code}' "$backend/api/health" || true)"
case "$status" in
  200) ;;
  503) echo "Backend is up but the sound service is not. Sound will fail until it starts." >&2 ;;
  *) echo "No backend at $backend." >&2; echo >&2; manual >&2; exit 1 ;;
esac

cd "$ROOT_DIR/frontend"
[[ -d node_modules ]] || npm ci --no-fund --no-audit
API_URL="$backend" exec npm run dev

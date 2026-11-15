#!/usr/bin/env bash
# Run the test suites. The backend tests run in Docker when the .NET SDK is missing.
# Usage: scripts/test.sh [all|frontend|sound|backend]
set -euo pipefail
source "$(dirname "$0")/_common.sh"

frontend() {
  need npm "Install Node.js 22 LTS: https://nodejs.org/"
  cd "$ROOT_DIR/frontend"
  [[ -d node_modules ]] || npm ci --no-fund --no-audit
  npm test
}

sound() {
  cd "$ROOT_DIR/sound-service"
  local py=.venv/bin/python
  [[ -x .venv/Scripts/python.exe ]] && py=.venv/Scripts/python.exe
  if [[ ! -x "$py" ]]; then
    if command -v uv >/dev/null 2>&1; then
      uv venv .venv && uv pip install --python .venv -e ".[dev]"
    else
      need python3 "Install Python 3.12+: https://www.python.org/downloads/"
      python3 -m venv .venv && .venv/bin/python -m pip install -e ".[dev]"
    fi
  fi
  "$py" -m pytest -q
}

backend() {
  cd "$ROOT_DIR/backend"
  if command -v dotnet >/dev/null 2>&1; then
    dotnet test EarthJukebox.slnx
  else
    need_docker
    echo "No .NET SDK found, running the backend tests in Docker."
    MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 \
      dotnet test EarthJukebox.slnx
  fi
}

case "${1:-all}" in
  frontend|sound|backend) "$1"; exit ;;
  all) ;;
  *) echo "Usage: scripts/test.sh [all|frontend|sound|backend]" >&2; exit 1 ;;
esac

# each suite in its own process so one failure does not stop the others
failed=()
for suite in frontend sound backend; do
  echo "== $suite"
  "$0" "$suite" || failed+=("$suite")
done
if (( ${#failed[@]} )); then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi
echo "All passed"

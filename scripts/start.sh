#!/usr/bin/env bash
# Build and start the whole app in Docker, wait until it is healthy.
# Usage: scripts/start.sh [-h|--help]
set -euo pipefail
source "$(dirname "$0")/_common.sh"
case "${1:-}" in -h|--help) usage; exit 0 ;; esac
need_docker

if [[ -f "$ROOT_DIR/.env" ]]; then
  echo "Settings: .env"
else
  echo "Settings: defaults (no .env, AI composer off)"
fi

compose up -d --build

address="$(compose port frontend 80 | tail -n 1)"
url="http://localhost:${address##*:}"
echo "Waiting for $url/api/health ..."
for _ in $(seq 1 90); do
  if curl -fsS "$url/api/health" >/dev/null 2>&1; then
    echo "Earth Jukebox is up: $url"
    exit 0
  fi
  sleep 2
done
echo "Not healthy after 3 minutes. Check: scripts/logs.sh" >&2
exit 1

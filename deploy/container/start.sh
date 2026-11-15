#!/usr/bin/env bash
# Start the sound service, the backend and nginx. If any of them exits, the container stops
# and Cloud Run starts a new one.
set -euo pipefail

# same variable name as compose.yaml and .env.example
export RateLimit__AiComposePerHour="${AI_PER_VISITOR_HOUR:-10}"

/app/sound/.venv/bin/python -m earth_sound serve &

# the backend reads Data/frames relative to its content root
(cd /app/backend && exec dotnet EarthJukebox.Api.dll) &

for _ in $(seq 1 60); do
  /app/sound/.venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" 2>/dev/null && break
  sleep 1
done

nginx -c /app/nginx.conf -g 'daemon off;' &

wait -n
echo "a process exited, stopping the container" >&2
exit 1

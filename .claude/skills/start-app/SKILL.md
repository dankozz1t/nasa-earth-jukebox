---
name: start-app
description: Bring up Earth Jukebox locally (Docker, all three services) and verify it works, or stop it. Use when asked to run, start, launch, rebuild, restart the project or app, open it in the browser, or check that a change works in the real app.
---

# Start Earth Jukebox

Commands, ports and fixes live in [docs/development.md](../../../docs/development.md). This skill is the order to run them in and what to check. Don't restate those docs, link them.

## 1. Preflight

1. `docker info >/dev/null` must succeed. If not, ask the person to start Docker Desktop. Don't try to install it.
2. Settings: `.env` in the repository root (copied from [.env.example](../../../.env.example) with `cp .env.example .env`) is optional. Without it the defaults apply and the AI composer is off.
3. AI is optional. Each developer uses their own key. Never create, print or copy a key. If the person wants AI and has no `.env`, tell them to copy the example and paste their own key.

## 2. Start

```bash
scripts/start.sh        # Windows: .\scripts\start.ps1
```

This builds the three images, starts them and waits for `/api/health`. The first build takes 3 to 10 minutes, so run it with a long timeout or in the background. It prints the URL, by default <http://localhost:5180>.

For quick frontend work against a running backend, use `scripts/dev.sh` instead (Vite on :5173).

## 3. Verify

Run these and report the results:

```bash
curl -fsS http://localhost:5180/api/health            # {"status":"ok","soundService":"ok"}
curl -fsS http://localhost:5180/api/weather/composer  # {"aiAvailable":true|false}
curl -fsS http://localhost:5180/api/frames | head -c 200
curl -fsS http://localhost:5180/ | grep -o '<html lang="[a-z]*"'   # en
```

Don't use `/health` on port 5180. It returns the SPA page, not a health check.

If the person wants to see the UI, open the URL in a browser and click a record. Sound needs a user click first. Don't press "AI composes", since each AI composition is a paid call.

## 4. When it fails

- Read the logs: `scripts/logs.sh [frontend|backend|sound-service]`.
- Match the symptom in [docs/development.md#troubleshooting](../../../docs/development.md#troubleshooting).
- Live weather with no internet: set `ES_WEATHER_OFFLINE=true` in `.env` and run start again. The bundled snapshot plays.

## 5. Stop

```bash
scripts/stop.sh
```

Only stop or rebuild containers when the person asked.

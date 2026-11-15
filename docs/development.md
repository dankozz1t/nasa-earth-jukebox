# Development

## Scripts

Run from the repository root. Windows: use the `.ps1` versions in PowerShell (`.\scripts\start.ps1`), or the `.sh` ones in Git Bash or WSL.

| Script | What it does |
|---|---|
| `scripts/start.sh` | `docker compose up -d --build`, waits for `/api/health`, prints the URL |
| `scripts/stop.sh` | Stops and removes the containers (images stay) |
| `scripts/logs.sh [service]` | Follows logs of `frontend`, `backend` or `sound-service` (all if empty) |
| `scripts/dev.sh` | Vite dev server with hot reload on :5173 against the backend on :8080. `--help` shows how to run every part by hand. No PowerShell twin: on Windows run `cd frontend; npm ci; npm run dev` |
| `scripts/test.sh [all\|frontend\|sound\|backend]` | Runs the test suites. Backend tests run in Docker if the .NET SDK is missing |

`start`, `stop` and `logs` print their usage with `-h` or `--help` and do nothing else.

Docker Compose reads settings from `.env` in the repository root (`cp .env.example .env`, see [.env.example](../.env.example)). It is the only settings file for Docker. Without it the defaults apply and the AI composer is off.

To run a second copy next to the first, set `COMPOSE_PROJECT_NAME` (for example `earth-jukebox-2`), `FRONTEND_PORT` and `BACKEND_PORT` in that copy's `.env`.

## Fast frontend loop

```bash
scripts/start.sh   # backend and sound service in Docker
scripts/dev.sh     # http://localhost:5173, /api goes to :8080
```

## Running each part by hand

| Tool | Needed for | Version |
|---|---|---|
| Node.js | frontend | 22 LTS (20+ works) |
| .NET SDK | backend | 10 |
| Python | sound service | 3.12+ ([uv](https://docs.astral.sh/uv/) optional) |

Each part in its own terminal, starting from the repository root:

```bash
# 1. sound-service (Python 3.12+), http://127.0.0.1:8000/docs
cd sound-service
python3.12 -m venv .venv                        # macOS ships Python 3.9 as python3; install 3.12+ first
.venv/bin/python -m pip install -e ".[dev]"     # Windows: py -3.12 -m venv .venv, then .venv\Scripts\python
.venv/bin/python -m earth_sound serve           # optional settings: copy .env.example to .env in this folder

# 2. backend (.NET 10 SDK), http://localhost:8080/api/health
cd backend
dotnet run --project src/EarthJukebox.Api

# 3. frontend (Node.js 20+), http://localhost:5173
cd frontend
npm ci
npm run dev
```

Ports: 5180 (app in Docker), 8080 (backend), 8000 (sound service, only when run by hand; inside Docker it is not published), 5173 (Vite).

Outside Docker the sound service also picks up Anthropic credentials from your environment, so AI may turn on and bill that account. See [ai.md](ai.md#the-ai-composer-optional).

With [uv](https://docs.astral.sh/uv/): `uv venv && uv pip install -e ".[dev]"` in `sound-service`.

## Tests

| Part | Command | Covers |
|---|---|---|
| frontend | `npm test` | Vitest and Testing Library: components, player, live model, translations, axe-core WCAG audit |
| sound-service | `.venv/bin/python -m pytest` | Domain (segmentation, score, synth, weather, stereo), HTTP contract, import-linter layer rules, fake AI and fake Open-Meteo (no network, no AI cost) |
| backend | `dotnet test EarthJukebox.slnx` | Catalog, validation, URL rewriting, proxy guards, weather relay, GIBS basemap |

Linters: `npm run lint` (ESLint) and `npm run format:check` (Prettier) in the frontend, `npm run build` also type-checks. In the sound service: `ruff check . && ruff format --check . && mypy`.

## Layout

```
compose.yaml         the three services
.env.example         optional settings and AI keys (copy to .env)
frontend/            React UI (src/shared -> src/features -> src/app)
backend/             C# API (src/EarthJukebox.Api, tests/)
sound-service/       Python: domain -> application -> adapters -> bootstrap
docs/                this documentation, screenshots, demo slides
scripts/             start, stop, logs, dev, test
deploy/             one-container image and the Google Cloud Run deploy script
.claude/skills/      the start-app skill for coding agents
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `failed to connect to the docker API` | Start Docker Desktop and wait for "Engine running". |
| Windows: "running scripts is disabled on this system" | `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1` |
| `port is already allocated` | Something already uses 5180 or 8080, often the same app started another way. Run `scripts/stop.sh`, or set `FRONTEND_PORT` / `BACKEND_PORT` in `.env`. |
| `/api/health` returns 503 | The sound service is not running. `scripts/logs.sh sound-service`. |
| The page loads but there is no sound | Click Play first (browsers block autoplay). On iPhone turn off silent mode. |
| `python` / `dotnet` / `node` not found | Install it, then open a new terminal. On Windows try `py` instead of `python`. |
| Windows: "An Application Control policy has blocked this file" | Smart App Control blocks native modules. Rollup is already swapped for its WASM build in `package.json`; for anything else use Docker. |
| Narration in Ukrainian uses an English voice | The device has no Ukrainian voice. Windows: Settings, Time & language, Speech, add a voice. |

## Conventions

- UI text goes through `t()` in English and Ukrainian (`frontend/src/shared/i18n/i18n.ts`); a test fails on hard-coded strings.
- Frontend dependencies point one way: `shared` -> `features` -> `app`. Features import each other only through `index.ts`.
- Sound service: hexagonal layers, checked by import-linter. The domain uses only NumPy.
- Comments only where the code cannot say why.
- No secrets in the repository: keys go into `.env`, which is git-ignored.
- Code, comments, docs and commits in English. Ukrainian only in the UK dictionary, the bilingual How-page content and `README.uk.md`.

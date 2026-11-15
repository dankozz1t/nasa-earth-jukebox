# sound-service

The service that makes the sound. It takes a NASA aerosol frame (PNG/JPEG/WebP) or the live weather and returns a score, WAV stems per layer or instrument, MIDI and a class map. Internal: only the [backend](../backend/) talks to it.

Hexagonal layout `bootstrap → adapters → application → domain → shared`; import-linter checks the boundaries.

```
src/earth_sound/
├── domain/                     pure logic, NumPy only
│   ├── aerosols/               4 NASA legend layers, HSV segmentation, column profiles (cos(latitude) corrected)
│   ├── music/                  score: raw / scale / harmony modes, D Dorian progression, voice leading
│   ├── sound/                  synthesis: additive and FM voices, instruments, surf noise, reverb, aerosol engine, stereo mix
│   └── weather/                sections, grid and interpolation, sine path, score plan, rule-based composer, arranger
├── application/
│   ├── compose_soundscape/     use case: frame → analysis → score → stems, id = hash of the input (cache key)
│   ├── compose_weather/        use case: weather → path → composer → arrangement → stems
│   ├── get_artifact/           stem, mix of chosen layers, MIDI, class map
│   ├── ports/                  ImageDecoder, AudioEncoder, MidiEncoder, ClassMapEncoder, AiComposer, WeatherSource, stores
│   └── models/
├── adapters/
│   ├── inbound/http/           FastAPI routers, schemas (camelCase), problem+json
│   └── outbound/               imaging (Pillow), audio (WAV), midi (mido), store (in-memory LRU), weather (Open-Meteo), ai
├── bootstrap/                  settings (ES_*), composition root, uvicorn
└── shared/                     errors (stdlib only)
tests/  unit · e2e (HTTP) · architecture (import-linter) · fakes · fixtures
```

How data becomes music: [docs/sound-mapping.md](../docs/sound-mapping.md).

## Live weather

```
Open-Meteo (10° grid, refreshed every 30 min) ─► sine path across the planet ─► per-bar features
   ─► composer: AI or rules ─► score plan (JSON) ─► sanitize_plan check
   ─► arrangement for 6–7 instruments ─► mono stems + stereo mix (north = left ear)
```

- `adapters/outbound/weather/open_meteo.py`: live data, no key. Refresh runs in the background and never blocks a request; until it finishes the service serves the last data or the bundled `snapshot.json.gz`.
- `adapters/outbound/ai/`: the optional AI composer. It gets per-bar features and returns a score in a JSON schema (structured outputs). It does not generate audio. Without a key, on refusal or error, the rule-based composer plays in the same format.
  - `prompt.py` (prompt, schema, dataset) and `llm_composer.py` (answer check, JSON → plan) are shared by all providers.
  - `transport.py`: the `LlmTransport` contract and the shared `ComposerError`.
  - `anthropic_transport.py`: `anthropic` SDK. `openrouter_transport.py`: `httpx` → OpenRouter chat completions with a strict json_schema.
  - `factory.py`: picks the provider (`ES_AI_PROVIDER`) and the default model.

| Method | Path | What |
|---|---|---|
| GET | `/v1/weather/sections` | The 4 weather layers |
| GET | `/v1/weather/grid` | Current grid (all variables) |
| GET | `/v1/weather/readings` | Recent planet averages |
| GET | `/v1/weather/composer` | Whether AI is available |
| POST | `/v1/weather/soundscapes` | JSON `{section, cycles 0.5–12, amplitude 0.1–1, durationSec 20–180, composer auto/ai/algorithmic/aerosol}` |
| GET | `/v1/weather/soundscapes/{id}/stems/{part}.wav` | Mono instrument stem |
| GET | `/v1/weather/soundscapes/{id}/mix.wav?parts=a,b&mono=true` | Stereo mix (panned by hemisphere) |

AI turns on with `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` (in the shell, in this folder's `.env`, or in the root `.env` for Docker; see `.env.example`). Run by hand, the service also accepts other Anthropic credentials from the environment (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_PROFILE`, `~/.config/anthropic`), so it may bill that account; `ES_AI_ENABLED=false` keeps AI off. Details: [docs/ai.md](../docs/ai.md).

| Variable | Value |
|---|---|
| `ES_AI_PROVIDER` | `auto` (default: Anthropic if its key is set, else OpenRouter), `anthropic`, `openrouter` |
| `ES_AI_MODEL` | empty = provider default: `claude-opus-5-5` (Anthropic), `anthropic/claude-haiku-5.5` (OpenRouter) |
| `ES_AI_EFFORT` | `low` (default), `medium`, `high` |

Each AI composition is a paid call; repeats with the same data and settings come from the cache. The startup log says whether AI is on and which provider (`AI composer on: …`).

## Aerosol API

| Method | Path | What |
|---|---|---|
| GET | `/health` | Status |
| POST | `/v1/soundscapes` | multipart: `image`, `colorbar?`, `mode` (raw/scale/harmony), `duration_sec` (10–180), `sensitivity` (0–4), `source_label` → JSON |
| GET | `/v1/soundscapes/{id}/stems/{key}.wav` | Layer stem (`black_carbon`, `dust`, `sea_salt`, `sulfate`, `bed`) |
| GET | `/v1/soundscapes/{id}/mix.wav?layers=a,b&bed=true` | Mix of chosen layers |
| GET | `/v1/soundscapes/{id}/score.mid?layers=…&bed=…` | MIDI type 1, 60 BPM |
| GET | `/v1/soundscapes/{id}/classmap.png` | Class of every pixel: 0, 50, 100, 150, 200 = none, 4 layers |

Swagger: `/docs`. Errors are `application/problem+json` (400, 404, 422).

## Run and check

```bash
python3.12 -m venv .venv                      # macOS python3 is 3.9; the service needs 3.12+
.venv/bin/python -m pip install -e ".[dev]"   # Windows: .venv\Scripts\python
.venv/bin/python -m earth_sound serve         # ES_HOST / ES_PORT, see .env.example
.venv/bin/python -m pytest                    # includes import-linter; fakes, so no network and no AI cost
ruff check . && ruff format --check .
mypy
```

Settings: `ES_MAX_UPLOAD_MB` (25), `ES_MAX_IMAGE_WIDTH` (1920, wider frames are scaled down), `ES_CACHE_SIZE` (8 soundscapes), `ES_SAMPLE_RATE` (22050), `ES_BINS` (128 scan steps), `ES_WEATHER_OFFLINE` (false).

## Good to know

- The aerosol sound comes **from the picture**, not from GEOS model data. Loudness means colour area, not concentration. NASA attribution: [NOTICE.md](NOTICE.md).
- One 64 s aerosol soundscape is about 15 MB of stems in memory (5 × 2.9 MB). The cache keeps `ES_CACHE_SIZE` of them.
- On the real SVS 5669 frame: about 3 s to generate, about 20 ms for a repeat.

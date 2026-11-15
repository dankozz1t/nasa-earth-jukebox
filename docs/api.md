# API

All public endpoints are served by the backend under `/api` (through nginx on port 5180, or directly on 8080). The OpenAPI document is at `/api/openapi.json`. Errors are `application/problem+json`.

## Health

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","soundService":"ok"}`, or 503 when the sound service is down |

## Live weather

| Method | Path | Returns |
|---|---|---|
| GET | `/api/weather/sections` | The four layers: temperature, precipitation, clouds, wind |
| GET | `/api/weather/grid` | Current global grid (10° step), observation time, `nextUpdateAt` |
| GET | `/api/weather/readings` | Planet averages of the last readings (up to 8, about 4 hours) |
| GET | `/api/weather/composer` | `{"aiAvailable": true/false}` |
| POST | `/api/weather/soundscapes` | Compose. Body below. Rate limited, AI capped per visitor (see [ai.md](ai.md)) |
| GET | `/api/weather/soundscapes/{id}/stems/{part}.wav` | One instrument stem (mono) |
| GET | `/api/weather/soundscapes/{id}/mix.wav?parts=a,b&mono=true` | Stereo mix of chosen parts (`mono=true` for mono) |
| GET | `/api/weather/basemap` | NASA GIBS Blue Marble image (JPEG). Fetched from NASA GIBS at most daily, served with a 6 h cache |

```json
{ "section": "precipitation", "cycles": 3, "amplitude": 0.8, "durationSec": 60, "composer": "algorithmic" }
```

| Field | Range | Default |
|---|---|---|
| `section` | `temperature`, `precipitation`, `clouds`, `wind` | `temperature` |
| `cycles` | 0.5–12 (sine waves across the planet) | 3 |
| `amplitude` | 0.1–1 (share of ±80° latitude) | 0.8 |
| `durationSec` | 20–180 | 60 |
| `composer` | `auto`, `ai`, `algorithmic`, `aerosol` | `auto` |

## NASA aerosol frame

| Method | Path | Returns |
|---|---|---|
| GET | `/api/frames` | Frame catalog (NASA SVS 5669) |
| GET | `/api/frames/{id}/image` | Frame PNG |
| POST | `/api/soundscapes` | Compose from a catalog frame. Body below. Rate limited |
| POST | `/api/soundscapes/upload` | Compose from your own image: multipart `image` (PNG/JPEG/WebP, max 25 MB), `mode`, `durationSec`, `sensitivity` |
| GET | `/api/soundscapes/{id}/stems/{key}.wav` | Layer stem: `black_carbon`, `dust`, `sea_salt`, `sulfate`, `bed` |
| GET | `/api/soundscapes/{id}/mix.wav?layers=a,b&bed=true` | Mix of chosen layers |
| GET | `/api/soundscapes/{id}/score.mid?layers=a,b&bed=true` | MIDI (type 1, 60 BPM) |
| GET | `/api/soundscapes/{id}/classmap.png` | Layer of every pixel |

```json
{ "frameId": "svs-5669", "mode": "harmony", "durationSec": 64, "sensitivity": 2 }
```

`mode` is `raw`, `scale` or `harmony`; `durationSec` 10–180; `sensitivity` 0–4.

## Limits

- 60 compositions per minute per client address (`RateLimit__ComposePerMinute`), 429 above that.
- Uploads up to 25 MB (`Uploads__MaxMegabytes`).
- Soundscape ids are 16 hex characters and live in the sound service's memory cache. After a restart an old id returns 404; compose again.

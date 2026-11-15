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
| GET | `/api/weather/basemap` | NASA GIBS Blue Marble image (JPEG). Fetched from NASA GIBS at most daily, browsers keep it a day (see [Caching](#caching)) |

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

## Caching

GET answers carry `Cache-Control` so browsers and any CDN in front can reuse them. Only successful answers do: errors (4xx, 5xx) and every POST go out without it, so they are never cached.

| Path | `Cache-Control` | Revalidation | Why |
|---|---|---|---|
| `/api/frames` | `public, max-age=3600` | none | The catalog is read once at startup and changes only with a deploy |
| `/api/frames/{id}/image` | `public, max-age=86400` | `ETag`, `Last-Modified` | Archived NASA frame, 2.7 MB |
| `/api/weather/basemap` | `public, max-age=86400` | `ETag`, `Last-Modified` | Blue Marble is static; the backend refetches it daily and keeps the tag when the picture is the same |
| `/api/weather/sections` | `public, max-age=86400` | weak `ETag` | Static config in the sound service |
| `/api/weather/composer` | `public, max-age=300` | weak `ETag` | Depends only on the server's key setup |
| `/api/weather/grid` | `public, max-age=` seconds until `nextUpdateAt`, 0–1800 | weak `ETag` | Expires when the next grid is due. A snapshot or a missing `nextUpdateAt` gets 60 s; a due time in the past (refresh running) gets 0 |
| `/api/weather/readings` | same as the grid | weak `ETag` | Uses the `nextUpdateAt` of the last grid the backend relayed; 60 s before the first grid or for a snapshot reading |
| `/api/soundscapes/{id}/...`, `/api/weather/soundscapes/{id}/...` | `public, max-age=86400, immutable`, set by the sound service | none | The id hashes the inputs, so the bytes never change |

A request with a matching `If-None-Match` (or `If-Modified-Since` for the files) gets `304 Not Modified` without a body. nginx gzips JSON, JS, CSS and SVG (also behind a proxy or CDN), never WAV, PNG or JPEG. It serves `/assets/` (hashed file names) with `public, max-age=31536000, immutable` and `index.html` with `no-cache`.

## Limits

- 60 compositions per minute per client address (`RateLimit__ComposePerMinute`), 429 above that.
- Uploads up to 25 MB (`Uploads__MaxMegabytes`).
- Soundscape ids are 16 hex characters and live in the sound service's memory cache. After a restart an old id returns 404; compose again.

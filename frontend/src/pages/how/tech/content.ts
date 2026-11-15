// The engineering view as data: an architecture description in the arc42 order (drivers, context,
// building blocks, runtime, data, interfaces, technology, crosscutting concepts, decisions, risks).
// English only. Facts are taken from the code: compose.yaml, frontend/nginx.conf,
// backend/src/EarthJukebox.Api, sound-service (pyproject.toml, src/earth_sound), frontend/src.

import { COMPONENTS, CONTAINERS, CONTEXT } from "./diagrams";
import type { EdgeKind, TableSpec, TechSection } from "./model";
import { SEQ_AEROSOL, SEQ_PLAYER, SEQ_REFRESH, SEQ_WEATHER } from "./sequences";

/** Words of the view's own chrome. */
export const UI = {
  toc: "Contents",
  scroll: "Scroll sideways to see all of it",
  elements: "Elements",
  boundary: "Boundary",
  relations: "Relationships",
  participants: "Participants",
  begin: "Begin",
  otherwise: "Otherwise",
  end: "End",
  sends: "calls",
  returns: "returns to",
  kinds: {
    sync: "calls",
    async: "notifies",
    realize: "implements",
    dep: "depends on",
  } satisfies Record<EdgeKind, string>,
};

const DRIVERS: TableSpec = {
  id: "drivers",
  caption: "Quality attribute scenarios (architecture drivers)",
  columns: ["ID", "Attribute", "Stimulus and response", "Measure", "Tactics"],
  rows: [
    [
      "QA-1",
      "Determinism",
      "The same frame and settings are composed twice",
      "Same `id`, byte identical WAV and MIDI",
      "`sha256` over all inputs, fixed `seed=5669` in the rules composer, no wall clock in the domain",
    ],
    [
      "QA-2",
      "Latency",
      "A listener picks a preset that was composed before",
      "Store hit about 20 ms, cold SVS 5669 compose about 3 s",
      "LRU by content id, TanStack Query dedupe, idle prefetch of the default preset, hover prefetch",
    ],
    [
      "QA-3",
      "Availability",
      "Open-Meteo is down, rate limited or out of daily budget",
      "Music keeps playing, the UI says the data is a snapshot",
      "Last good grid, bundled `snapshot.json.gz`, exponential backoff, budget guard",
    ],
    [
      "QA-4",
      "Robustness to AI output",
      "The LLM returns malformed, off key or truncated JSON",
      "Audio never breaks, repairs listed in `warnings`",
      "Strict JSON schema, `sanitize_plan`, rules composer fallback on `ComposerError`",
    ],
    [
      "QA-5",
      "Abuse resistance",
      "One client floods the compose endpoints",
      "429 after 60 requests per minute per real client IP",
      "Fixed window limiter keyed by `RemoteIpAddress` after trusted forwarded headers",
    ],
    [
      "QA-6",
      "Accessibility",
      "A blind listener explores the map without a pointer",
      "WCAG 2.2 AA, axe clean on every view in both languages and themes",
      "Keyboard explorer, live regions, captions, speech, tactile and CSV exports",
    ],
    [
      "QA-7",
      "Cost",
      "Free tiers and paid AI calls",
      "Weather under 80 % of 10 000 calls a day, AI only on request",
      "Fetch counter per UTC day, AI result cached by id, rules first for the AI preset",
    ],
    [
      "QA-8",
      "Footprint",
      "First visit on a mid range phone over 4G",
      "Main JS at most 180 KB gzip, LCP at most 2.5 s",
      "`React.lazy` for `/how`, the Tune drawer and this view, no audio framework, fonts local",
    ],
  ],
};

const NOTATION: TableSpec = {
  id: "notation",
  caption: "Diagram notation",
  columns: ["Element", "Meaning"],
  rows: [
    ["Filled green box", "The system in scope"],
    ["Dashed grey box", "External system we do not own"],
    ["White box", "Container or component"],
    ["Cylinder", "Data at rest"],
    ["Yellow box", "Application port (an interface the core owns)"],
    ["Dashed frame", "Deployment or layer boundary"],
    ["Solid line, filled head", "Synchronous call"],
    ["Dashed line, open head", "Response, or asynchronous notification"],
    ["Dashed line, hollow triangle", "Realizes (implements) an interface"],
    ["Dotted line, open head", "Build time, import or wiring dependency"],
    ["`alt` / `opt` / `loop` frame", "UML combined fragment: alternatives, option, iteration"],
  ],
};

const CONTAINER_TABLE: TableSpec = {
  id: "containers",
  caption: "Containers",
  columns: ["Container", "Technology", "Port and exposure", "Responsibility", "State"],
  rows: [
    [
      "Browser SPA",
      "React 19, TypeScript 5, Vite 6, Web Audio",
      "served by `frontend`",
      "UI, playback, exploration, captions, speech, exports",
      "`prefs` in localStorage (Zustand persist), stems and compositions in memory",
    ],
    [
      "`frontend`",
      "nginx 1.27-alpine, static bundle built on node:22-alpine",
      "`:80`, host `127.0.0.1:5180`",
      "Static files, SPA fallback, `/api/` reverse proxy, gzip, real client IP",
      "none",
    ],
    [
      "`backend`",
      "ASP.NET Core minimal API, .NET 10, non-root `$APP_UID`",
      "`:8080`, host `127.0.0.1:8080` for dev only",
      "Frame catalog, validation, rate limiting, artifact proxy, GIBS basemap cache, OpenAPI",
      "Catalog in the image, basemap in RAM for 24 h, output cache",
    ],
    [
      "`sound-service`",
      "FastAPI + uvicorn, Python 3.13, uid 10001",
      "`:8000`, not published",
      "Image analysis, composition, synthesis, weather polling, AI composer",
      "LRU stores, readings deque, read-only root FS, tmpfs `/tmp` 64 MB",
    ],
  ],
};

const CONTRACTS: TableSpec = {
  id: "contracts",
  caption: "Import contracts (import-linter, pyproject.toml), checked by tests/architecture",
  columns: ["Contract", "Type", "Rule"],
  rows: [
    ["`hexagon`", "layers", "`bootstrap` > `adapters` > `application` > `domain` > `shared`"],
    [
      "`pure-core`",
      "forbidden",
      "`shared`, `domain`, `application` import none of `fastapi`, `starlette`, `uvicorn`, `pydantic`, `pydantic_settings`, `PIL`, `mido`, `anthropic`, `urllib`",
    ],
    ["`kernel-stdlib-only`", "forbidden", "`shared` imports no `numpy`"],
    [
      "`adapter-sides`",
      "independence",
      "`adapters.inbound` and `adapters.outbound` never import each other",
    ],
    [
      "`outbound-isolation`",
      "independence",
      "each `adapters.outbound.*` package is self contained",
    ],
    ["`domain-layers`", "layers", "`sound` > (`music` | `weather`) > `aerosols`"],
    [
      "`application-layers`",
      "layers",
      "(`compose_soundscape` | `compose_weather` | `get_artifact`) > `ports` > `models`",
    ],
  ],
};

const USE_CASES: TableSpec = {
  id: "use-cases",
  caption: "Use cases of the sound service",
  columns: ["Use case", "Input", "Ports", "Output", "Notes"],
  rows: [
    [
      "`ComposeSoundscape`",
      "`ComposeCommand(image, colorbar, mode, duration_sec 10..180, sensitivity 0..4, source_label)`",
      "`ImageDecoder`, `SoundscapeStore`",
      "`Soundscape`",
      "Store hit returns before decoding. Width capped by `ES_MAX_IMAGE_WIDTH` (1920)",
    ],
    [
      "`GetArtifact`",
      "id, stem key, `layers`, `bed`",
      "`SoundscapeStore`, `AudioEncoder`, `MidiEncoder`, `ClassMapEncoder`",
      "`Artifact(content, media_type, filename)`",
      "Stems, custom `mix.wav`, `score.mid` (type 1, 60 BPM), lossless `classmap.png`",
    ],
    [
      "`ComposeWeather`",
      "`ComposeWeatherCommand(section, cycles, amplitude, duration_sec, composer)`",
      "`WeatherSource`, `AiComposer`, `WeatherStore`",
      "`WeatherSoundscape`",
      "`composer`: `auto` | `ai` | `algorithmic` | `aerosol`. The id includes `observed_at`, so a new reading is a new piece",
    ],
    [
      "`GetWeatherArtifact`",
      "id, part, `parts`, `mono`",
      "`WeatherStore`, `AudioEncoder`",
      "`Artifact`",
      "Mono stems per instrument, stereo mix panned by hemisphere",
    ],
  ],
};

const FRONTEND_MODULES: TableSpec = {
  id: "frontend-modules",
  caption: "Frontend modules (feature sliced: shared > features > app)",
  columns: ["Layer", "Path", "Contents", "Rule"],
  rows: [
    [
      "app",
      "`src/app`",
      "`App`, routes, `Header`, `RouteHeading`, providers, error boundaries",
      "Composes features, owns routing",
    ],
    ["pages", "`src/pages/how`, `src/pages/team`", "Lazy routes", "Use features and shared"],
    [
      "features",
      "`src/features/{presets, stage, live, transport, tune, access, save, help, aerosols}`",
      "UI and a pure `model/` per feature, public `index.ts`",
      "Other features only through `index.ts`",
    ],
    [
      "audio",
      "`src/audio`",
      "`StemPlayer`, `ProbeVoice`, `Narrator`, `usePlayer`",
      "Framework free, React reads it via `useSyncExternalStore`",
    ],
    [
      "shared",
      "`src/shared/{api, i18n, ui, lib, styles}`",
      "fetch client and `ApiError`, query keys, dictionaries, UI primitives, tokens",
      "Imports nothing above it",
    ],
  ],
};

function typeTable(id: string, caption: string, rows: [string, string, string][]): TableSpec {
  return { id, caption, columns: ["Field", "Type", "Meaning"], rows };
}

const T_SOUNDSCAPE = typeTable(
  "t-soundscape",
  "Soundscape (application.models.soundscape, frozen dataclass)",
  [
    ["`id`", "`str`", "16 hex chars, `sha256` of the inputs"],
    ["`analysis`", "`FrameAnalysis`", "Per layer masks, column profiles, hue source"],
    ["`score`", "`Score`", "Notes, chord steps and the bed"],
    [
      "`stems`",
      "`dict[str, NDArray[float32]]`",
      "One mono buffer per layer plus `bed`, equal master gain",
    ],
    ["`sample_rate`", "`int`", "22 050 Hz by default (`ES_SAMPLE_RATE`)"],
    ["`source_label`", "`str`", "Catalog source and title, or the upload file name"],
  ],
);

const T_WEATHER = typeTable(
  "t-weather-soundscape",
  "WeatherSoundscape (application.models.weather)",
  [
    ["`id`", "`str`", "`sha256` of reading time, settings and AI availability"],
    ["`section`", "`Section`", "temperature, precipitation, clouds or wind"],
    ["`path`", "`SinePath`", "`cycles` 0.5..12, `amplitude` 0.1..1 of 80 degrees"],
    ["`observed_at`", "`str`", "ISO 8601 UTC time of the measurements"],
    ["`is_snapshot`", "`bool`", "True when built from the bundled fallback"],
    ["`features`", "`tuple[BarFeatures, ...]`", "Our dataset: one row per bar"],
    ["`plan`", "`ScorePlan`", "The composer's dataset (AI or rules)"],
    ["`arrangement`", "`Arrangement`", "Notes per part for 6 or 7 instruments"],
    ["`audio`", "`WeatherAudio`", "Mono stems and the stereo mix"],
    ["`samples`", "`dict[str, ndarray]`", "512 path samples: `t`, `lat`, `lon`, `value`, `level`"],
    ["`composer_requested`", "`str`", "What the client asked for, next to what was used"],
    ["`warnings`", "`tuple[str, ...]`", "Grid notes, AI repairs, fallbacks"],
  ],
);

const T_GRID = typeTable("t-grid", "WeatherGrid (domain.weather.grid)", [
  [
    "`lats`, `lons`",
    "`NDArray[float64]`",
    "Cell centres, 18 by 36 at a 10 degree step, `lons` in [-180, 180)",
  ],
  [
    "`values`",
    "`dict[str, NDArray]`",
    "`temperature` C, `precipitation` mm/h, `clouds` %, `wind` km/h, shape [lat, lon]",
  ],
  ["`observed_at`", "`str`", "Latest `current.time` over all points, UTC"],
  ["`source`", "`str`", "Attribution: Open-Meteo, CC BY 4.0"],
  ["`is_snapshot`", "`bool`", "Served from `snapshot.json.gz`"],
  ["`notes`", "`tuple[str, ...]`", "Refreshing, budget used, offline"],
  ["`fetched_at`", "`str | None`", "When the service pulled it"],
  [
    "`next_update_at`",
    "`str | None`",
    "Next :00 or :30 UTC + 90 s, or a retry time while backing off",
  ],
]);

const T_READING = typeTable("t-reading", "Reading (domain.weather.readings)", [
  ["`observed_at`", "`str`", "Reading time, one entry per new `observed_at`"],
  ["`is_snapshot`", "`bool`", "Snapshot summary while no live reading exists"],
  ["`means`", "`dict[str, float]`", "Planet mean per variable, weighted by cos(latitude)"],
  ["`maxima`", "`dict[str, float]`", "Planet maximum per variable"],
]);

const T_FEATURES = typeTable("t-features", "BarFeatures (domain.weather.path), one per bar", [
  ["`bar`", "`int`", "Bar index"],
  ["`lon_start`, `lon_end`", "`float`", "Longitudes the bar covers, west to east"],
  ["`lat_mean`", "`float`", "Mean latitude of the path in the bar"],
  ["`hemisphere`", "`str`", "`north`, `south` or `equator`: the stereo side"],
  [
    "`value_mean`, `value_min`, `value_max`",
    "`float`",
    "In the section's unit, from 16 samples per bar",
  ],
  ["`level`, `level_peak`", "`float`", "Normalised 0..1 mean and maximum (log scale for rain)"],
]);

const T_PLAN = typeTable("t-plan", "ScorePlan and PlanBar (domain.weather.plan)", [
  ["`mode`", "`str`", "`major` or `minor`"],
  ["`bars`", "`tuple[PlanBar, ...]`", "Exactly `bars_for(duration, tempo)` after sanitizing"],
  ["`PlanBar.chord`", "`str`", "Roman numeral from the mode's set, for example `I V vi IV`"],
  [
    "`PlanBar.melody`",
    "`tuple[MelodyNote, ...]`",
    "At most 8 notes, beat on a 0.5 grid, degree -7..14, velocity 0.2..1",
  ],
  ["`PlanBar.arp_density`, `pad_level`, `percussion`", "`float`", "0..1 texture levels"],
  ["`PlanBar.accent`", "`bool`", "A bell on the downbeat"],
  [
    "`title`, `rationale_en`, `rationale_uk`",
    "`str`",
    "Capped at 80 and 600 chars, shown in the UI",
  ],
  ["`composer`", "`str`", "`algorithmic` or `ai:<model>`"],
  ["`notes`", "`tuple[str, ...]`", "What sanitizing had to fix, at most 10"],
]);

const T_PRESET = typeTable("t-preset", "Preset (frontend, features/presets/presets.ts)", [
  [
    "`id`",
    "`PresetId`",
    "8 presets: 3 NASA archive (`nasa-four` is the default), 5 live. Each row starts with the person's own mix (`custom`)",
  ],
  ["`source`", '`"live" | "nasa"`', "Discriminant of the union"],
  ["`cover`", "`CoverId`", "Sleeve art, inline SVG"],
  ["`settings`", "`WeatherSettings | ComposeSettings`", "Request body for the compose endpoint"],
  [
    "`repeat`",
    "`Repeat`",
    "Live only: `one`, or `all` (set in Sound settings) for the four layer tour",
  ],
  ["`bed`", "`boolean`", "NASA only: include the drone bed stem"],
]);

const T_PLAYER = typeTable("t-player", "PlayerSnapshot and Deck (frontend, audio/stem-player.ts)", [
  [
    "`playing`, `ready`",
    "`boolean`",
    "Snapshot for `useSyncExternalStore`, same object until a field changes",
  ],
  ["`duration`", "`number`", "Scan length in seconds, stems run longer for the reverb tail"],
  ["`tag`", "`unknown`", "Who owns the current deck (preset id)"],
  ["`Deck.buffers`", "`Map<string, AudioBuffer>`", "Decoded stems"],
  ["`Deck.gains`", "`Map<string, GainNode>`", "One per stem: mute and solo without reloading"],
  ["`Deck.out`", "`GainNode`", "Deck fader for the 0.3 s swap and the 2.5 s tail crossfade"],
  ["position", "not in the snapshot", "Changes every frame: read `player.position` in a rAF loop"],
]);

const SECTIONS_TABLE: TableSpec = {
  id: "sections",
  caption: "Weather sections (domain.weather.sections)",
  columns: ["Section", "Range mapped to 0..1", "Tempo", "Key", "Lead", "Arpeggio", "Texture"],
  rows: [
    ["`temperature`", "cold to hot", "84 BPM", "D", "piano", "marimba", "none"],
    ["`precipitation`", "dry to heavy, log scale", "76 BPM", "A", "piano", "harp", "rain"],
    ["`clouds`", "clear to overcast", "68 BPM", "F", "flute", "harp", "none"],
    ["`wind`", "calm to strong", "96 BPM", "G", "flute", "marimba", "wind"],
  ],
};

const API_PUBLIC: TableSpec = {
  id: "api-public",
  caption: "Public API (through nginx, prefix /api)",
  columns: ["Endpoint", "Request", "Response", "Caching", "Rate limit"],
  rows: [
    ["`GET /api/health`", "none", "`{status, soundService}`, 200 or 503", "none", "none"],
    ["`GET /api/frames`", "none", "`FrameView[]`", "none", "none"],
    [
      "`GET /api/frames/{id}/image`",
      "none",
      "`image/png`, range requests",
      "output cache 1 h",
      "none",
    ],
    [
      "`POST /api/soundscapes`",
      "JSON `{frameId, mode: raw|scale|harmony, durationSec 10..180, sensitivity 0..4}`",
      "`SoundscapeOut` + `frame`, artifact URLs rewritten",
      "client: query key by settings hash, `staleTime: Infinity`. Server: LRU by id",
      "`compose`, 60/min per IP",
    ],
    [
      "`POST /api/soundscapes/upload`",
      "multipart `image` (PNG, JPEG, WebP, 25 MB), `mode`, `durationSec`, `sensitivity`",
      "same, `frame: null`, calibrated with the SVS 5669 legend",
      "client 5 min",
      "`compose`",
    ],
    [
      "`GET /api/soundscapes/{id}/{**path}`",
      "`stems/{key}.wav`, `mix.wav`, `score.mid`, `classmap.png`. Query: `layers`, `bed`",
      "streamed bytes",
      "`public, max-age=86400, immutable`",
      "none",
    ],
    [
      "`GET /api/weather/sections`",
      "none",
      "`SectionOut[]`, 4 items",
      "client `staleTime: Infinity`",
      "none",
    ],
    [
      "`GET /api/weather/grid`",
      "none",
      "`GridOut`: 18 x 36 per variable, `observedAt`, `nextUpdateAt`, `isSnapshot`, `notes`",
      "server: fresh until `next_update_at` (30 min cycle). Client: refetch at `nextUpdateAt` + 60 s",
      "none",
    ],
    [
      "`GET /api/weather/readings`",
      "none",
      "`{readings: ReadingOut[]}`, up to 8 (4 h)",
      "client key per `observedAt`",
      "none",
    ],
    ["`GET /api/weather/composer`", "none", "`{aiAvailable}`", "none", "none"],
    [
      "`POST /api/weather/soundscapes`",
      "JSON `{section, cycles 0.5..12, amplitude 0.1..1, durationSec 20..180, composer: auto|ai|algorithmic|aerosol}`",
      "`WeatherSoundscapeOut`",
      "server LRU (6) by id incl. `observed_at`. Client `staleTime` until the next update",
      "`compose`",
    ],
    [
      "`GET /api/weather/soundscapes/{id}/{**path}`",
      "`stems/{part}.wav`, `mix.wav`. Query: `parts`, `mono`",
      "WAV",
      "`public, max-age=86400, immutable`",
      "none",
    ],
    [
      "`GET /api/weather/basemap`",
      "none",
      "`image/jpeg`, 1440 x 720, equirectangular",
      "singleton 24 h (failed refresh keeps the old image) + output cache 6 h",
      "none",
    ],
    ["`GET /api/openapi.json`", "none", "OpenAPI document", "none", "none"],
  ],
};

const API_INTERNAL: TableSpec = {
  id: "api-internal",
  caption: "Internal API of sound-service (compose network only, Swagger at /docs)",
  columns: ["Endpoint", "Request", "Response"],
  rows: [
    ["`GET /health`", "none", "status, used by the Docker healthcheck every 30 s"],
    [
      "`POST /v1/soundscapes`",
      "multipart: `image`, `colorbar?`, `mode`, `duration_sec`, `sensitivity`, `source_label`",
      "`SoundscapeOut`, artifacts relative",
    ],
    [
      "`GET /v1/soundscapes/{id}/stems/{key}.wav`",
      "`key`: `black_carbon`, `dust`, `sea_salt`, `sulfate`, `bed`",
      "16-bit PCM WAV",
    ],
    ["`GET /v1/soundscapes/{id}/mix.wav`", "`layers=a,b`, `bed=true`", "mix of the chosen layers"],
    ["`GET /v1/soundscapes/{id}/score.mid`", "`layers`, `bed`", "MIDI type 1, 60 BPM"],
    ["`GET /v1/soundscapes/{id}/classmap.png`", "none", "class per pixel: 0, 50, 100, 150, 200"],
    [
      "`GET /v1/weather/sections`, `/grid`, `/readings`, `/composer`",
      "none",
      "as the public routes",
    ],
    ["`POST /v1/weather/soundscapes`", "JSON, same bounds", "`WeatherSoundscapeOut`"],
    ["`GET /v1/weather/soundscapes/{id}/stems/{part}.wav`, `/mix.wav`", "`parts`, `mono`", "WAV"],
  ],
};

const ERRORS: TableSpec = {
  id: "errors",
  caption: "Error model (RFC 9457 problem+json)",
  columns: ["Situation", "Status", "Body"],
  rows: [
    ["Invalid body in the API", "400", "`ValidationProblem` with errors per field"],
    [
      "Unknown id or artifact path (regex whitelist)",
      "404",
      "problem, the request never reaches the service",
    ],
    ["Over the compose limit", "429", "from `RateLimiter`"],
    [
      "Service answers 4xx (not 408)",
      "relayed as is",
      "the service's problem+json explains the cause",
    ],
    ["Service 5xx, timeout or unreachable", "502", "`The sound service failed`, no internals"],
    ["Health with the service down", "503", "`{status: degraded, soundService: unavailable}`"],
    ["GIBS basemap unavailable", "502", "problem"],
  ],
};

const STACK: TableSpec = {
  id: "stack",
  caption:
    "Technology stack with versions from package.json, *.csproj, pyproject.toml and Dockerfiles",
  columns: ["Tier", "Concern", "Technology", "Version"],
  rows: [
    ["Frontend", "UI", "`react`, `react-dom`", "^19.3.1"],
    ["Frontend", "Language", "TypeScript, strict", "^5.8.3"],
    ["Frontend", "Build", "Vite + `@vitejs/plugin-react`, target es2022", "^6.3.5, ^4.7.0"],
    ["Frontend", "Routing", "`react-router`, library mode", "^7.18.5"],
    ["Frontend", "Server state", "`@tanstack/react-query`", "^5.107.1"],
    ["Frontend", "Client state", "`zustand` (persist for prefs)", "^5.1.0"],
    ["Frontend", "Icons", "`lucide-react`", "^1.73.0"],
    [
      "Frontend",
      "Fonts",
      "Unbounded, Golos Text, IBM Plex Mono, Atkinson Hyperlegible Next (`@fontsource`)",
      "^5.3.0",
    ],
    [
      "Frontend",
      "Audio and platform",
      "Web Audio (`AudioContext`, `GainNode`, `StereoPannerNode`, `AnalyserNode`), Web Speech, Vibration",
      "native",
    ],
    [
      "Frontend",
      "Tests",
      "`vitest`, `jsdom`, `@testing-library/react`, `user-event`, `axe-core`",
      "^3.2.4, ^31.0.1, ^16.3.3, ^14.6.10, ^4.14.0",
    ],
    [
      "Frontend",
      "Lint and format",
      "`eslint` + `typescript-eslint`, `jsx-a11y`, `react-hooks`, `prettier`",
      "^9.39.5, ^8.72.2, ^6.10.2, ^7.1.1, 3.10.1",
    ],
    ["Edge", "Web server", "nginx (image), build on node", "1.27-alpine, 22-alpine"],
    ["Backend", "Runtime", "ASP.NET Core minimal APIs, `net10.0`, `aspnet:10.0` image", ".NET 10"],
    ["Backend", "OpenAPI", "`Microsoft.AspNetCore.OpenApi`", "10.0.15"],
    [
      "Backend",
      "Built in",
      "RateLimiter, ForwardedHeaders, OutputCache, ProblemDetails, typed `HttpClient`",
      ".NET 10",
    ],
    [
      "Backend",
      "Build flags",
      "`Nullable`, `TreatWarningsAsErrors`, `InvariantGlobalization`",
      "csproj",
    ],
    [
      "Backend",
      "Tests",
      "`xunit`, `Microsoft.AspNetCore.Mvc.Testing`, `Microsoft.NET.Test.Sdk`",
      "2.9.3, 10.0.15, 17.14.1",
    ],
    ["Sound", "Runtime", "Python, `python:3.13-slim-bookworm` image", ">= 3.12"],
    ["Sound", "Web", "`fastapi`, `uvicorn[standard]`", ">= 0.115 < 1.0, >= 0.30"],
    [
      "Sound",
      "Validation and config",
      "`pydantic`, `pydantic-settings`, `python-multipart`",
      ">= 2.9, >= 2.5, >= 0.0.18",
    ],
    ["Sound", "DSP and numerics", "`numpy`", ">= 2.1 < 3.0"],
    ["Sound", "Imaging, MIDI", "`pillow`, `mido`", ">= 11.0 < 13.0, >= 1.3"],
    ["Sound", "AI", "`anthropic` SDK, `httpx` for OpenRouter", ">= 2.0 < 3.0, >= 0.27"],
    [
      "Sound",
      "Default models",
      "`claude-opus-5-5` (Anthropic), `anthropic/claude-haiku-5.5` (OpenRouter), `ES_AI_EFFORT=low`",
      "config",
    ],
    [
      "Sound",
      "Quality",
      "`pytest`, `ruff`, `mypy --strict`, `import-linter`",
      ">= 8.3, >= 0.8, >= 1.13, >= 2.1",
    ],
    ["Ops", "Orchestration", "Docker Compose, healthchecks, `depends_on` conditions", "compose v2"],
  ],
};

const CACHES: TableSpec = {
  id: "caches",
  caption: "Cache layers, outermost first",
  columns: ["Layer", "Key", "Lifetime", "Notes"],
  rows: [
    [
      "nginx",
      "`/assets/*` (hashed names)",
      "`max-age=31536000, immutable`",
      "`/` is `no-cache`, so a deploy is picked up at once",
    ],
    [
      "Browser HTTP cache",
      "artifact URL",
      "1 day, immutable",
      "Safe because the id is a content hash",
    ],
    [
      "TanStack Query",
      '`["compose", source, hash(settings, observedAt)]`',
      "live: until `nextUpdateAt`. NASA: forever. Upload: 5 min",
      "Hover prefetch, click and idle warm-up share one request",
    ],
    [
      "`stemsCache`",
      "soundscape id",
      "LRU of 5",
      "Single flight, progress fan out, aborted only when every waiter aborts",
    ],
    ["ASP.NET output cache", "route", "frame image 1 h, basemap 6 h", "In process"],
    [
      "`NasaBasemap`",
      "singleton",
      "24 h",
      "Semaphore guarded, a failed refresh keeps the old bytes",
    ],
    [
      "`MemoryStore`",
      "soundscape id",
      "LRU, 8 aerosol (`ES_CACHE_SIZE`), 6 weather",
      "About 15 MB per 64 s aerosol piece. Lost on restart by design: everything is reproducible",
    ],
    [
      "`OpenMeteoWeatherSource`",
      "none",
      "grid until `next_update_at`, history deque of 8",
      "Snapshot fallback bundled in the image",
    ],
  ],
};

const RESILIENCE: TableSpec = {
  id: "resilience",
  caption: "Failure modes and behaviour",
  columns: ["Failure", "Detection", "Behaviour"],
  rows: [
    [
      "Open-Meteo unreachable",
      "`URLError` before any answer",
      "Stale grid or snapshot, backoff 60 s doubling to 300 s, the failed try costs no budget",
    ],
    ["Open-Meteo 429", "`HTTPError` 429", "Wait `Retry-After` (at most 60 s), 3 tries per batch"],
    [
      "Reading not yet published",
      "same `observed_at` after a fetch",
      "Up to 3 early retries 120 s apart, only with spare budget",
    ],
    [
      "Daily budget spent",
      "fetch counter per UTC day",
      "Serve the last grid with a note, next try at 00:00 UTC",
    ],
    [
      "AI refusal, truncation, bad JSON, HTTP error",
      "`ComposerError`",
      "Rules composer, reason in `warnings`, `composer.used` tells the client",
    ],
    ["AI plan out of range", "`sanitize_plan`", "Repaired, repairs in `warnings`"],
    [
      "Sound service down",
      "`IsHealthyAsync`, 5xx, timeout",
      "`/api/health` 503, compose 502, the client shows a retry toast",
    ],
    ["Broken catalog in the image", "startup resolve", "The deploy fails, not the first visitor"],
    [
      "Next layer not ready at the boundary",
      "tour readiness",
      "The current deck keeps looping, never silence. Compose and stems retried 3 times, 10 s apart",
    ],
    [
      "Lazy chunk fails (Safari module import)",
      "chunk error in the boundary",
      "Try again reloads the page",
    ],
  ],
};

const TESTS: TableSpec = {
  id: "tests",
  caption: "Test strategy",
  columns: ["Suite", "Tooling", "Size", "What it pins"],
  rows: [
    [
      "frontend",
      "Vitest + Testing Library + jsdom + axe-core",
      "36 files, 576 tests",
      "axe WCAG 2.2 A/AA on every route, both languages, both themes and open dialogs. Player decks, presets, live diff, tour, i18n key parity, no literals in TSX, contrast of tokens",
    ],
    [
      "sound-service",
      "pytest, fakes for weather and AI",
      "106 tests (75 functions)",
      "Domain (segmentation, score, synth, sine path, stereo), HTTP contract, Open-Meteo scheduling and budget with a fake clock, AI composer parsing, import contracts. No network, no API spend",
    ],
    [
      "backend",
      "xUnit + `WebApplicationFactory`, stubbed sound service",
      "32 cases (15 facts, 4 theories)",
      "Catalog, validation, URL rewrite, proxy whitelist and traversal, rate limit behind a proxy, weather relay, basemap",
    ],
    [
      "static",
      "`tsc --noEmit`, ESLint, Prettier, ruff, mypy strict",
      "every change",
      "Types end to end, hooks rules, a11y lint",
    ],
  ],
};

const BUDGETS: TableSpec = {
  id: "budgets",
  caption: "Performance budgets and measured figures",
  columns: ["Metric", "Budget or figure", "Source"],
  rows: [
    [
      "Main JS bundle",
      "at most 180 KB gzip, fonts excluded",
      "design budget, checked on `npm run build`",
    ],
    ["LCP", "at most 2.5 s on Fast 4G", "design budget"],
    ["First preset after idle prefetch", "at most 1 s to sound", "design budget"],
    ["Aerosol compose, SVS 5669, cold", "about 3 s", "sound-service README"],
    ["Repeat compose (store hit)", "about 20 ms", "sound-service README"],
    ["Live grid diff on the client", "648 points x 4 layers, O(n), no workers", "design budget"],
    [
      "Timeouts",
      "nginx read 180 s, API to service 120 s, AI 90 s, Open-Meteo 20 s per request",
      "config",
    ],
    ["Upload limit", "25 MB (Kestrel, form, service), nginx body 26 MB", "config"],
  ],
};

const TRADEOFFS: TableSpec = {
  id: "tradeoffs",
  caption: "Known limitations and trade-offs",
  columns: ["Decision", "Alternative", "Why", "Cost"],
  rows: [
    [
      "Sound from the image pixels",
      "GEOS-FP numeric fields",
      "The challenge frame is an image, pixels are reproducible",
      "Loudness is colour area, not concentration",
    ],
    [
      "10 degree weather grid",
      "Finer grid",
      "648 points fit the free tier at a 30 min cadence",
      "Local showers fall between points",
    ],
    [
      "Server side synthesis",
      "Tone.js in the browser",
      "Deterministic bytes, exports, small client",
      "CPU on the server, about 15 MB RAM per piece",
    ],
    [
      "In-memory LRU",
      "Redis or disk",
      "Zero ops, everything is reproducible from inputs",
      "Cold cache after restart, one replica only",
    ],
    [
      "C# API in front of Python",
      "Expose FastAPI directly",
      "One hardened public surface, the service stays internal",
      "One extra hop and two stacks to run",
    ],
    [
      "AI writes a plan, not audio",
      "Generative audio model",
      "Explainable, cheap, repairable, never breaks playback",
      "Musical range bounded by our ensemble",
    ],
    [
      "Polling, not push",
      "SSE or WebSocket",
      "Readings change every 30 min, the client knows `nextUpdateAt`",
      "Up to about 60 s of lag after a new reading",
    ],
    [
      "Single node Compose",
      "Kubernetes",
      "Hackathon scale, one command to run",
      "No horizontal scale, rate limit and caches are per process",
    ],
  ],
};

const DECISIONS: TableSpec = {
  id: "decisions",
  caption: "Key architecture decisions",
  columns: ["Decision", "Status"],
  rows: [
    ["Static web app, analysis and sound in the browser", "replaced by the three-tier design"],
    ["Three tiers: frontend, C# API, Python sound microservice", "accepted"],
    [
      "Live weather: Open-Meteo, sine path, stereo by hemisphere, AI composer of a dataset",
      "accepted",
    ],
    ["Live repeat: all layers in turn, seamless, swap on the tail", "accepted"],
    ["React frontend: jukebox with presets, two labelled sources, record style", "accepted"],
  ],
};

export const SECTIONS: TechSection[] = [
  {
    id: "drivers",
    title: "Goals and quality drivers",
    blocks: [
      {
        kind: "p",
        text: "Earth Jukebox sonifies two Earth datasets: a NASA SVS 5669 GEOS-FP aerosol frame (archive, deterministic) and a global Open-Meteo grid (live, a new reading every 30 minutes). Analysis and synthesis run server side in a Python service behind a C# API, the browser only plays stems in sync and renders the map. The architecture optimises for determinism, graceful degradation and accessibility, in that order.",
      },
      { kind: "table", table: DRIVERS },
      { kind: "table", table: NOTATION },
    ],
  },
  {
    id: "context",
    title: "System context",
    blocks: [{ kind: "box", diagram: CONTEXT }],
  },
  {
    id: "containers",
    title: "Containers and deployment",
    blocks: [
      { kind: "box", diagram: CONTAINERS },
      { kind: "table", table: CONTAINER_TABLE },
      {
        kind: "list",
        items: [
          "Start order: `sound-service` must be `service_healthy` (Python healthcheck on `/health`), then `backend` starts, then `frontend`.",
          "`sound-service` runs `read_only: true` with `tmpfs /tmp:size=64m`, non-root uid 10001. `backend` runs as `$APP_UID` with `DOTNET_gcServer=0`.",
          "nginx resolves `backend` per request through Docker DNS (`resolver 127.0.0.11 valid=10s`, `proxy_pass $backend`), so a backend restart never leaves a stale IP.",
          "Secrets (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`) come from the environment only, never from the image or the repository. Without a key the rules composer plays.",
        ],
      },
    ],
  },
  {
    id: "components",
    title: "Components",
    blocks: [
      { kind: "box", diagram: COMPONENTS },
      { kind: "table", table: CONTRACTS },
      { kind: "table", table: USE_CASES },
      { kind: "table", table: FRONTEND_MODULES },
    ],
  },
  {
    id: "runtime",
    title: "Runtime views",
    blocks: [
      { kind: "seq", diagram: SEQ_AEROSOL },
      { kind: "seq", diagram: SEQ_WEATHER },
      { kind: "seq", diagram: SEQ_PLAYER },
      { kind: "seq", diagram: SEQ_REFRESH },
    ],
  },
  {
    id: "data",
    title: "Data model",
    blocks: [
      {
        kind: "p",
        text: "Core types are frozen, slotted dataclasses (Python) and discriminated unions (TypeScript). HTTP DTOs are separate pydantic models with camelCase aliases, so the domain never sees the wire format.",
      },
      { kind: "table", table: T_SOUNDSCAPE },
      { kind: "table", table: T_WEATHER },
      { kind: "table", table: T_GRID },
      { kind: "table", table: T_READING },
      { kind: "table", table: T_FEATURES },
      { kind: "table", table: T_PLAN },
      { kind: "table", table: SECTIONS_TABLE },
      { kind: "table", table: T_PRESET },
      { kind: "table", table: T_PLAYER },
    ],
  },
  {
    id: "api",
    title: "API contract",
    blocks: [
      { kind: "table", table: API_PUBLIC },
      { kind: "table", table: API_INTERNAL },
      { kind: "table", table: ERRORS },
    ],
  },
  {
    id: "stack",
    title: "Technology stack",
    blocks: [{ kind: "table", table: STACK }],
  },
  {
    id: "crosscutting",
    title: "Crosscutting concepts",
    blocks: [
      { kind: "h3", text: "Caching and determinism" },
      {
        kind: "p",
        text: "Every composition id is `sha256(inputs)[:16]`: image and legend bytes plus mode, duration and sensitivity for the archive, and `observed_at`, section, cycles, amplitude, duration, composer and AI availability for live. Identical requests therefore share one store entry, one query cache entry and immutable artifact URLs at every layer.",
      },
      { kind: "table", table: CACHES },
      { kind: "h3", text: "Rate limiting and the real client IP" },
      {
        kind: "list",
        items: [
          "nginx trusts loopback and private ranges (`set_real_ip_from`, `real_ip_recursive on`) and forwards `X-Forwarded-For` and `X-Forwarded-Proto`.",
          "ASP.NET `UseForwardedHeaders` runs first, accepts one hop (`ForwardLimit = 1`) and only from `127.0.0.0/8`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`, `fe80::/10`. A spoofed header from the internet is ignored.",
          "Policy `compose`: fixed window, `RateLimit:ComposePerMinute` (60) per `RemoteIpAddress`, on all three compose routes. Artifact reads are not limited, they are cheap and cacheable.",
        ],
      },
      { kind: "h3", text: "Resilience" },
      { kind: "table", table: RESILIENCE },
      { kind: "h3", text: "Accessibility architecture" },
      {
        kind: "list",
        items: [
          "Everything a person reads goes through `t()`; a test parses every `.tsx` with the TypeScript compiler and fails on a literal word.",
          "One polite live region (`say()`) for state changes: new reading, playback, layer changes. Captions are a separate visual channel driven by the score.",
          "Map explorer: arrow keys move a cursor over the grid, each point is named and played through `ProbeVoice`, `Narrator` speaks places with Web Speech.",
          "Exports for non visual use: WebVTT captions, CSV for TwoTone and Highcharts Sonification Studio, a tactile SVG for swell paper printing.",
          "Prefs (`theme`, high contrast, readable font, text scale, reduced motion, stereo, vibration) are classes and CSS variables on `<html>`; tokens are tested for contrast.",
          "Routing moves focus to the new page's `h1` and names the tab; error boundaries wrap header, routes, player bar and drawers.",
        ],
      },
      { kind: "h3", text: "Internationalisation" },
      {
        kind: "p",
        text: 'Two flat dictionaries (`en`, `uk`) with key parity tests, a context `useT()` and a non React `t()` for engine code. Server notes arrive in English and are mapped to keys by pattern. The composer returns `rationale_en` and `rationale_uk`. This engineering view is English only and is marked `lang="en"`.',
      },
      { kind: "h3", text: "Testing" },
      { kind: "table", table: TESTS },
      { kind: "h3", text: "Performance" },
      { kind: "table", table: BUDGETS },
      { kind: "h3", text: "Security" },
      {
        kind: "list",
        items: [
          "One public surface. The proxy accepts only `^[0-9a-f]{16}$` ids and whitelisted artifact paths, so traversal and other service routes return 404 before any upstream call.",
          "Upload size enforced three times (nginx, Kestrel and form, FastAPI read limit), content type checked, file names truncated.",
          "Upstream 5xx details are never relayed. Containers run as non-root, the sound service with a read-only root file system.",
          "No cookies, no accounts, no personal data: antiforgery is off on the stateless upload route by design.",
        ],
      },
    ],
  },
  {
    id: "risks",
    title: "Decisions, trade-offs and risks",
    blocks: [
      { kind: "table", table: TRADEOFFS },
      { kind: "table", table: DECISIONS },
    ],
  },
];

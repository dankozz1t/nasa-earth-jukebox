// Runtime views (UML sequence diagrams). Message texts name the real functions, routes and limits.

import type { SequenceSpec } from "./model";

export const SEQ_AEROSOL: SequenceSpec = {
  id: "seq-aerosol",
  title: "Sequence 1: compose an aerosol soundscape (NASA archive)",
  caption:
    "Synchronous request path through all three tiers. The id is a content hash, so the second identical request is a store hit (about 20 ms against about 3 s cold for SVS 5669) and every artifact URL is immutable. nginx is collapsed into the first hop after message 2.",
  participants: [
    { id: "spa", title: "Browser SPA", tech: "engine.pickPreset" },
    { id: "nginx", title: "nginx", tech: "location /api/" },
    { id: "api", title: "backend", tech: "SoundscapeEndpoints" },
    { id: "svc", title: "sound-service", tech: "routers.soundscapes" },
    { id: "uc", title: "ComposeSoundscape", tech: "use case" },
    { id: "store", title: "MemoryStore", tech: "LRU, ES_CACHE_SIZE=8" },
    { id: "dom", title: "domain", tech: "aerosols, music, sound" },
  ],
  messages: [
    {
      from: "spa",
      to: "nginx",
      text: "POST /api/soundscapes\n{frameId, mode, durationSec, sensitivity}",
    },
    { from: "nginx", to: "api", text: "proxy_pass, X-Forwarded-For" },
    {
      from: "api",
      to: "api",
      text: 'UseForwardedHeaders, RateLimiter "compose"\nComposeRules.Validate, FrameCatalog.TryGet',
    },
    { from: "api", to: "spa", kind: "return", text: "429 | 400 ValidationProblem" },
    {
      from: "api",
      to: "svc",
      text: "POST v1/soundscapes, multipart: image,\ncolorbar, mode, duration_sec, sensitivity",
    },
    { from: "svc", to: "uc", text: "run_in_threadpool(ComposeCommand)" },
    { from: "uc", to: "uc", text: "id = sha256(image, colorbar,\nmode|duration|sensitivity)[:16]" },
    { from: "uc", to: "store", text: "get(id)" },
    { from: "store", to: "uc", kind: "return", text: "Soundscape" },
    {
      from: "uc",
      to: "dom",
      text: "decode to HSV, width <= 1920\nsample_colorbar_hues, analyze_frame",
    },
    {
      from: "uc",
      to: "dom",
      text: "build_score(mode, sensitivity)\nrender_stems(score), 22 050 Hz",
    },
    { from: "uc", to: "store", text: "put(soundscape), evict LRU" },
    {
      from: "svc",
      to: "api",
      kind: "return",
      text: "200 SoundscapeOut, camelCase\nartifacts as relative paths",
    },
    {
      from: "api",
      to: "api",
      text: "id must match ^[0-9a-f]{16}$\nRewriteArtifacts to /api/soundscapes/{id}/",
    },
    { from: "api", to: "spa", kind: "return", text: "200 application/json + frame" },
    { from: "spa", to: "api", text: "GET .../stems/{layer}.wav" },
    {
      from: "api",
      to: "spa",
      kind: "return",
      text: "streamed WAV, Cache-Control:\npublic, max-age=86400, immutable",
    },
  ],
  fragments: [
    {
      kind: "alt",
      label: "over 60/min or invalid",
      start: 3,
      end: 14,
      others: [{ at: 4, label: "valid" }],
    },
    { kind: "alt", label: "store hit", start: 8, end: 11, others: [{ at: 9, label: "miss" }] },
    { kind: "loop", label: "5 stems: 4 layers + bed, in parallel", start: 15, end: 16 },
  ],
};

export const SEQ_WEATHER: SequenceSpec = {
  id: "seq-weather",
  title: "Sequence 2: compose a live weather soundscape with the AI composer",
  caption:
    "The model never produces audio. It returns a score plan under a strict JSON schema, `sanitize_plan` repairs anything out of range (repairs are reported in `warnings`), and the service renders the sound itself. Any `ComposerError` (refusal, `max_tokens`, invalid JSON, HTTP status, network) falls back to the deterministic rules composer with the same plan format. `composer=aerosol` (not drawn) swaps plan and ensemble for the NASA aerosol engine.",
  participants: [
    { id: "spa", title: "Browser SPA", tech: "composeLive" },
    { id: "api", title: "backend", tech: "WeatherEndpoints" },
    { id: "uc", title: "ComposeWeather", tech: "use case" },
    { id: "src", title: "WeatherSource", tech: "OpenMeteoWeatherSource" },
    { id: "store", title: "WeatherStore", tech: "LRU, 6" },
    { id: "ai", title: "AiComposer", tech: "LlmComposer" },
    { id: "llm", title: "LLM provider", tech: "Anthropic | OpenRouter", kind: "external" },
    { id: "dom", title: "domain", tech: "weather, sound" },
  ],
  messages: [
    {
      from: "spa",
      to: "api",
      text: "POST /api/weather/soundscapes\n{section, cycles, amplitude, durationSec, composer}",
    },
    {
      from: "api",
      to: "api",
      text: "Validate: cycles 0.5..12, amplitude 0.1..1\ndurationSec 20..180, rate limit",
    },
    { from: "api", to: "uc", text: "POST v1/weather/soundscapes\nrun_in_threadpool(command)" },
    { from: "uc", to: "src", text: "current(), never blocks" },
    { from: "src", to: "uc", kind: "return", text: "WeatherGrid: live | stale | snapshot" },
    {
      from: "uc",
      to: "uc",
      text: "id = sha256(observed_at|section|cycles|\namplitude|duration|composer|ai)[:16]",
    },
    { from: "uc", to: "store", text: "get(id)" },
    { from: "store", to: "uc", kind: "return", text: "WeatherSoundscape" },
    {
      from: "uc",
      to: "dom",
      text: "bars_for, bar_features (16 samples/bar)\npath_samples(512)",
    },
    {
      from: "uc",
      to: "ai",
      text: "compose(ComposerRequest: section, unit,\nmood, tonic, tempo, bars, features[])",
    },
    {
      from: "ai",
      to: "llm",
      text: "json_schema strict, effort low\nmax_tokens 16000, timeout 90 s",
    },
    { from: "llm", to: "ai", kind: "return", text: "score plan JSON" },
    { from: "ai", to: "uc", kind: "return", text: "dict | raise ComposerError" },
    {
      from: "uc",
      to: "dom",
      text: 'sanitize_plan(raw, bars, "ai:<model>")\nbars, chords, 0.5 beat grid, ranges',
    },
    { from: "uc", to: "dom", text: "compose_algorithmic(features,\nsection, seed=5669)" },
    {
      from: "uc",
      to: "dom",
      text: "arrange(plan), render_weather: mono stems\n+ stereo mix, north left, south right",
    },
    { from: "uc", to: "store", text: "put(soundscape)" },
    {
      from: "uc",
      to: "api",
      kind: "return",
      text: "WeatherSoundscapeOut, composer\n{requested, used, aiAvailable}, warnings",
    },
    {
      from: "api",
      to: "spa",
      kind: "return",
      text: "200, artifacts rewritten to\n/api/weather/soundscapes/{id}/",
    },
  ],
  fragments: [
    { kind: "alt", label: "store hit", start: 7, end: 16, others: [{ at: 8, label: "miss" }] },
    {
      kind: "alt",
      label: "composer auto or ai, AI configured",
      start: 9,
      end: 14,
      others: [{ at: 14, label: "AI off, or ComposerError: rules" }],
    },
  ],
};

export const SEQ_PLAYER: SequenceSpec = {
  id: "seq-player",
  title: "Sequence 3: preset pick to sound, two-deck player, boundary crossfade",
  caption:
    "One async handler, no effect chains. A newer pick aborts the older run (AbortController plus `cancelQueries`), so only the last of several quick clicks sounds. The next piece (next weather layer, or the same layer composed from a newer reading) is decoded into the second deck and started by the Web Audio clock at the cycle boundary, so the swap is sample accurate and never silent.",
  participants: [
    { id: "user", title: "Listener", tech: "pointer, keyboard", kind: "actor" },
    { id: "shelf", title: "PresetShelf", tech: "usePreset" },
    { id: "eng", title: "engine", tech: "pickPreset" },
    { id: "q", title: "QueryClient", tech: "TanStack Query 5" },
    { id: "api", title: "/api", tech: "nginx, backend" },
    { id: "cache", title: "stemsCache", tech: "single flight, LRU 5" },
    { id: "player", title: "StemPlayer", tech: "2 decks" },
    { id: "ctx", title: "AudioContext", tech: "Web Audio clock" },
  ],
  messages: [
    { from: "user", to: "shelf", text: "click or Enter on a sleeve" },
    { from: "shelf", to: "eng", text: "pickPreset(deps, id, play=true)" },
    {
      from: "eng",
      to: "eng",
      text: "startRun: abort older run, cancelQueries,\ndrop queued next deck and pick toasts",
    },
    {
      from: "eng",
      to: "q",
      text: 'fetchQuery(["compose", source, hash])\nlive staleTime = nextUpdateAt - now',
    },
    { from: "q", to: "api", text: "POST compose, shared with hover\nprefetch and idle warm-up" },
    { from: "api", to: "q", kind: "return", text: "Soundscape | WeatherSoundscape" },
    { from: "q", to: "eng", kind: "return", text: "soundscape" },
    { from: "eng", to: "cache", text: "get(s, signal, onProgress)" },
    {
      from: "cache",
      to: "api",
      text: "GET stems/*.wav in parallel\naborted only when all waiters abort",
    },
    { from: "api", to: "cache", kind: "return", text: "ArrayBuffer per stem" },
    { from: "cache", to: "eng", kind: "return", text: "Record<stem, ArrayBuffer>" },
    { from: "eng", to: "player", text: "load(stems, durationSec, tag,\n{restart, stale})" },
    {
      from: "player",
      to: "ctx",
      text: "decodeAudioData x N, GainNode per stem\n-> deck.out -> master -> analyser -> panner",
    },
    { from: "player", to: "ctx", text: "retire(old deck, 0.3 s)\nstartDeck(new, fade in)" },
    { from: "eng", to: "player", text: "setRepeat(one | all)\nsession.show(s, mix)" },
    { from: "eng", to: "player", text: "setNext(stems, duration, tag)\ntoken guarded" },
    {
      from: "player",
      to: "ctx",
      text: "start next deck at origin + duration\nramp current deck 1 -> 0 over 2.5 s",
    },
    {
      from: "player",
      to: "player",
      text: "poll() at nextAt: cur = next,\nretire(old), onAdvance(tag)",
    },
    { from: "player", to: "eng", kind: "return", text: "onAdvance: session.show(next)" },
  ],
  fragments: [
    { kind: "opt", label: "not in the query cache", start: 4, end: 5 },
    { kind: "opt", label: "stems not cached", start: 8, end: 9 },
    { kind: "opt", label: "was playing", start: 13, end: 13 },
    {
      kind: "loop",
      label: "repeat all, or a newer reading: every cycle boundary",
      start: 15,
      end: 18,
    },
  ],
};

export const SEQ_REFRESH: SequenceSpec = {
  id: "seq-refresh",
  title: "Sequence 4: live weather refresh, backoff, early retries, daily budget",
  caption:
    "Request threads never wait on the network: `current()` answers from memory and at most one daemon thread fetches. A fetch is 65 billable calls (648 points, 10 per call). The budget is 80 % of the 10 000 daily free calls, so 123 fetches per UTC day against 48 regular ones (every 30 min, about 3 120 calls). Early retries for a not yet published reading are spent only when every remaining regular update still fits.",
  participants: [
    { id: "spa", title: "Browser SPA", tech: "useLiveGrid" },
    { id: "api", title: "backend", tech: "WeatherEndpoints.Relay" },
    { id: "src", title: "WeatherSource", tech: "OpenMeteoWeatherSource" },
    { id: "th", title: "refresh thread", tech: "open-meteo-refresh" },
    { id: "om", title: "Open-Meteo", tech: "/v1/forecast", kind: "external" },
  ],
  messages: [
    {
      from: "spa",
      to: "api",
      text: "GET /api/weather/grid, refetch at\nnextUpdateAt + 60 s, at least 60 s",
    },
    { from: "api", to: "src", text: "v1/weather/grid\nrun_in_threadpool(current)" },
    { from: "src", to: "api", kind: "return", text: "cached grid" },
    {
      from: "src",
      to: "src",
      text: "_start_refresh: skip if refreshing,\nbacking off or budget spent",
    },
    { from: "src", to: "th", kind: "async", text: "Thread(target=_refresh).start()" },
    {
      from: "src",
      to: "api",
      kind: "return",
      text: 'stale grid + "Refreshing..." note, or\nsnapshot.json.gz with retry in 60 s',
    },
    {
      from: "th",
      to: "om",
      text: "GET current=temperature_2m,precipitation,\ncloud_cover,wind_speed_10m",
    },
    { from: "om", to: "th", kind: "return", text: "rows | 429: Retry-After, max 60 s, 3 tries" },
    { from: "th", to: "th", text: "_count_fetch: only if the API answered" },
    { from: "th", to: "th", text: "due = now + 120 s" },
    {
      from: "th",
      to: "th",
      text: "due = next :00 or :30 UTC + 90 s\nhistory.append(summarize), deque 8 = 4 h",
    },
    { from: "th", to: "th", text: "backoff 60 s, x2, cap 300 s\nretry_after = now + backoff" },
    { from: "spa", to: "api", text: "GET /api/weather/readings\nquery key per observedAt" },
    { from: "api", to: "spa", kind: "return", text: "readings[] up to 8, cos(lat) weighted" },
    {
      from: "spa",
      to: "spa",
      text: "new observedAt: diff 648 points, flash,\nannounce, queue piece at loop boundary",
    },
  ],
  fragments: [
    {
      kind: "alt",
      label: "fresh: now < next_update_at, age < ttl + 90 s",
      start: 2,
      end: 5,
      others: [{ at: 3, label: "stale or empty" }],
    },
    { kind: "loop", label: "6 batches x 120 points, 1.5 s apart", start: 6, end: 7 },
    {
      kind: "alt",
      label: "fetch completed",
      start: 8,
      end: 11,
      others: [{ at: 11, label: "exception" }],
    },
    {
      kind: "alt",
      label: "same observed_at, under 3 retries, spare budget",
      start: 9,
      end: 10,
      others: [{ at: 10, label: "new reading" }],
    },
  ],
};

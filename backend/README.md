# backend

Public API in C# (ASP.NET Core, .NET 10). The only entry point for the frontend: it holds the NASA frame catalog, validates input and calls the [sound-service](../sound-service/) for audio.

```
src/EarthJukebox.Api/
├── Program.cs                 DI, limits, rate limiting, problem details, OpenAPI, /api/health
├── Frames/                    frame catalog (Data/frames/catalog.json + PNG), GET /api/frames
├── Soundscapes/               compose (catalog / upload), validation, artifact proxy
├── Weather/                   live weather relay, NASA GIBS basemap, cache lifetime of the grid
├── Http/                      Cache-Control and ETag helpers
├── SoundService/              typed HttpClient for the Python service
└── Data/frames/svs-5669/      NASA SVS 5669 frame and its legend
tests/EarthJukebox.Api.Tests/  xUnit + WebApplicationFactory, sound service replaced by a stub
```

Endpoints: [docs/api.md](../docs/api.md). OpenAPI: `/api/openapi.json`. Cache headers per endpoint: [docs/api.md#caching](../docs/api.md#caching).

## Safety

- The proxy passes only whitelisted paths (regex) and checks the id (16 hex). Path traversal and other sound-service endpoints return 404 and never reach the service.
- Uploads are limited to 25 MB (Kestrel and form) and the file type is checked.
- Rate limit on compositions: 60 per minute per address (`RateLimit:ComposePerMinute`). AI compositions: 10 per hour per address (`RateLimit:AiComposePerHour`), past that the request is sent to the rule-based composer with a warning. Behind nginx the address comes from `X-Forwarded-For`, trusted only from loopback and private networks (the compose network).
- 4xx answers from the sound service are passed through (they explain what is wrong); 5xx and timeouts become 502 without internal details.
- A broken `catalog.json` or a missing frame file fails at startup, not on the first request.

## Run

```bash
dotnet run --project src/EarthJukebox.Api          # http://localhost:8080
dotnet test EarthJukebox.slnx
```

Without a local .NET SDK, run the tests in Docker (or `scripts/test.sh backend` from the repository root):

```bash
docker run --rm -v "$PWD:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet test EarthJukebox.slnx
```

Configuration (`appsettings.json` or environment variables): `SoundService__BaseUrl`, `SoundService__ComposeTimeoutSeconds`, `Uploads__MaxMegabytes`, `RateLimit__ComposePerMinute`, `RateLimit__AiComposePerHour` (compose sets it from `AI_PER_VISITOR_HOUR` in the root `.env`), `Basemap__CacheHours` (24: how often the GIBS image is fetched again).

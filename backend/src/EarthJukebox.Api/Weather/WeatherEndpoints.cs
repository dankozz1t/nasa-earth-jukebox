using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using EarthJukebox.Api.Http;
using EarthJukebox.Api.SoundService;

namespace EarthJukebox.Api.Weather;

public sealed record WeatherComposeRequest(
    string Section = "temperature",
    double Cycles = 3,
    double Amplitude = 0.8,
    double DurationSec = 60,
    string Composer = "auto");

public static partial class WeatherEndpoints
{
    public static readonly string[] Sections = ["temperature", "precipitation", "clouds", "wind"];
    public static readonly string[] Composers = ["auto", "ai", "algorithmic", "aerosol"];

    [GeneratedRegex("^[0-9a-f]{16}$")]
    private static partial Regex IdPattern();

    [GeneratedRegex(@"^(stems/[a-z_]{1,32}\.wav|mix\.wav)$")]
    private static partial Regex ArtifactPattern();

    [GeneratedRegex("^[a-z_,]{0,120}$")]
    private static partial Regex PartsPattern();

    public static IEndpointRouteBuilder MapWeather(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/weather").WithTags("Weather");

        group.MapGet("/sections", (SoundServiceClient s, HttpContext http, CancellationToken ct) =>
                Relay(s.GetAsync("v1/weather/sections", ct), http, _ => CacheHeaders.StaticConfig))
            .WithSummary("List the weather map sections");

        group.MapGet("/grid", (SoundServiceClient s, WeatherSchedule schedule, HttpContext http, CancellationToken ct) =>
                Relay(s.GetAsync("v1/weather/grid", ct), http, body => schedule.ForGrid(body, DateTimeOffset.UtcNow)))
            .WithSummary("Current global weather grid");

        group.MapGet("/readings", (SoundServiceClient s, WeatherSchedule schedule, HttpContext http, CancellationToken ct) =>
                Relay(s.GetAsync("v1/weather/readings", ct), http, body => schedule.ForReadings(body, DateTimeOffset.UtcNow)))
            .WithSummary("Recent weather readings");

        group.MapGet("/composer", (SoundServiceClient s, HttpContext http, CancellationToken ct) =>
                Relay(s.GetAsync("v1/weather/composer", ct), http, _ => CacheHeaders.ServerConfig))
            .WithSummary("Check if the AI composer is configured");

        group.MapPost("/soundscapes", Compose)
            .WithSummary("Compose a soundscape from live weather")
            .RequireRateLimiting(Soundscapes.SoundscapeEndpoints.ComposePolicy);

        group.MapGet("/soundscapes/{id}/{**path}", GetArtifact)
            .WithSummary("Download a stem or the mix of a weather soundscape");

        group.MapGet("/basemap", async Task<IResult> (NasaBasemap basemap, HttpContext http, CancellationToken ct) =>
            {
                var image = await basemap.GetAsync(ct);
                if (image is null)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway, title: "NASA GIBS basemap is unavailable");
                }
                CacheHeaders.SetPublic(http.Response, CacheHeaders.Image);
                return TypedResults.File(image.Bytes, "image/jpeg", lastModified: image.LastModified, entityTag: image.ETag);
            })
            .WithSummary("NASA Blue Marble basemap image")
            .CacheOutput(p => p.Expire(TimeSpan.FromHours(6)));

        return app;
    }

    internal static Dictionary<string, string[]> Validate(WeatherComposeRequest r)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Sections.Contains(r.Section, StringComparer.Ordinal)) errors["section"] = [$"Must be one of: {string.Join(", ", Sections)}."];
        if (double.IsNaN(r.Cycles) || r.Cycles is < 0.5 or > 12) errors["cycles"] = ["Must be between 0.5 and 12."];
        if (double.IsNaN(r.Amplitude) || r.Amplitude is < 0.1 or > 1) errors["amplitude"] = ["Must be between 0.1 and 1."];
        if (double.IsNaN(r.DurationSec) || r.DurationSec is < 20 or > 180) errors["durationSec"] = ["Must be between 20 and 180 seconds."];
        if (!Composers.Contains(r.Composer, StringComparer.Ordinal)) errors["composer"] = [$"Must be one of: {string.Join(", ", Composers)}."];
        return errors;
    }

    private static async Task<IResult> Compose(WeatherComposeRequest request, SoundServiceClient sound, AiQuota quota, HttpContext http, CancellationToken ct)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);
        var aiCapped = request.Composer is "ai" or "auto" && !quota.TryTake(http.Connection.RemoteIpAddress?.ToString() ?? "unknown");
        var composer = aiCapped ? "algorithmic" : request.Composer;
        JsonObject result;
        try
        {
            result = await sound.PostJsonAsync("v1/weather/soundscapes", new
            {
                section = request.Section,
                cycles = request.Cycles,
                amplitude = request.Amplitude,
                durationSec = request.DurationSec,
                composer,
            }, ct);
        }
        catch (SoundServiceException e)
        {
            return Soundscapes.SoundscapeEndpoints.RelayError(e);
        }
        var id = result["id"]?.GetValue<string>() ?? string.Empty;
        if (!IdPattern().IsMatch(id))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway, title: "Sound service returned an invalid id");
        }
        Soundscapes.SoundscapeEndpoints.RewriteArtifacts(result, id, "/api/weather/soundscapes/");
        if (aiCapped)
        {
            const string note = "Hourly AI limit for this visitor reached. Used the algorithmic composer instead.";
            if (result["warnings"] is JsonArray warnings) warnings.Add(note);
            else result["warnings"] = new JsonArray(note);
        }
        return TypedResults.Content(result.ToJsonString(), "application/json");
    }

    private static async Task<IResult> GetArtifact(string id, string path, string? parts, bool? mono, HttpContext http, SoundServiceClient sound, CancellationToken ct)
    {
        if (!IdPattern().IsMatch(id) || !ArtifactPattern().IsMatch(path) || (parts is not null && !PartsPattern().IsMatch(parts)))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found");
        }
        var query = new List<string>();
        if (parts is not null) query.Add($"parts={Uri.EscapeDataString(parts)}");
        if (mono is true) query.Add("mono=true");
        var target = $"v1/weather/soundscapes/{id}/{path}" + (query.Count > 0 ? "?" + string.Join('&', query) : string.Empty);
        HttpResponseMessage upstream;
        try
        {
            upstream = await sound.GetArtifactAsync(target, ct);
        }
        catch (SoundServiceException e)
        {
            return Soundscapes.SoundscapeEndpoints.RelayError(e);
        }
        http.Response.RegisterForDispose(upstream);
        if (upstream.Headers.CacheControl is { } cache) http.Response.Headers.CacheControl = cache.ToString();
        var contentType = upstream.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        return TypedResults.Stream(await upstream.Content.ReadAsStreamAsync(ct), contentType);
    }

    private static async Task<IResult> Relay(Task<string> call, HttpContext http, Func<string, TimeSpan> maxAge)
    {
        try
        {
            var body = await call;
            return CacheHeaders.Json(http, body, maxAge(body));
        }
        catch (SoundServiceException e)
        {
            return Soundscapes.SoundscapeEndpoints.RelayError(e);
        }
    }
}

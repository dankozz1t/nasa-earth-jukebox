using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using EarthJukebox.Api.Frames;
using EarthJukebox.Api.SoundService;
using Microsoft.AspNetCore.Mvc;

namespace EarthJukebox.Api.Soundscapes;

public sealed record UploadOptions
{
    public const string Section = "Uploads";
    public int MaxMegabytes { get; init; } = 25;
    public long MaxBytes => MaxMegabytes * 1024L * 1024L;
}

public static partial class SoundscapeEndpoints
{
    public const string ComposePolicy = "compose";

    private static readonly string[] ImageTypes = ["image/png", "image/jpeg", "image/webp"];

    [GeneratedRegex("^[0-9a-f]{16}$")]
    private static partial Regex IdPattern();

    // Whitelist of artifact paths: anything else would let a caller reach other endpoints of the sound service.
    [GeneratedRegex(@"^(stems/[a-z_]{1,32}\.wav|mix\.wav|score\.mid|classmap\.png)$")]
    private static partial Regex ArtifactPattern();

    [GeneratedRegex("^[a-z_,]{0,100}$")]
    private static partial Regex LayersPattern();

    public static IEndpointRouteBuilder MapSoundscapes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/soundscapes").WithTags("Soundscapes");

        group.MapPost("/", ComposeFromCatalog)
            .WithSummary("Compose a soundscape from a catalog frame")
            .RequireRateLimiting(ComposePolicy);

        group.MapPost("/upload", ComposeFromUpload)
            .WithSummary("Compose a soundscape from an uploaded image")
            .DisableAntiforgery() // no cookies, so nothing to forge
            .RequireRateLimiting(ComposePolicy);

        group.MapGet("/{id}/{**path}", GetArtifact)
            .WithSummary("Download a stem, mix, MIDI file or class map");

        return app;
    }

    private static async Task<IResult> ComposeFromCatalog(
        ComposeRequest request,
        FrameCatalog catalog,
        SoundServiceClient sound,
        CancellationToken ct)
    {
        var errors = ComposeRules.Validate(request.Mode, request.DurationSec, request.Sensitivity);
        if (!catalog.TryGet(request.FrameId ?? string.Empty, out var frame))
        {
            errors["frameId"] = ["Unknown frame. GET /api/frames lists the available ones."];
        }
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var input = new ComposeInput(
            Image: await File.ReadAllBytesAsync(catalog.Resolve(frame.Image), ct),
            ImageFileName: Path.GetFileName(frame.Image),
            Colorbar: await File.ReadAllBytesAsync(catalog.Resolve(frame.Colorbar), ct),
            Mode: request.Mode,
            DurationSec: request.DurationSec,
            Sensitivity: request.Sensitivity,
            SourceLabel: $"{frame.Source} - {frame.Title}");
        return await Compose(input, sound, FrameCatalog.ToView(frame), ct);
    }

    private static async Task<IResult> ComposeFromUpload(
        IFormFile image,
        [FromForm] string? mode,
        [FromForm] double? durationSec,
        [FromForm] int? sensitivity,
        FrameCatalog catalog,
        SoundServiceClient sound,
        Microsoft.Extensions.Options.IOptions<UploadOptions> uploads,
        CancellationToken ct)
    {
        var m = mode ?? "harmony";
        var d = durationSec ?? 64;
        var s = sensitivity ?? 2;
        var errors = ComposeRules.Validate(m, d, s);
        if (image.Length == 0)
        {
            errors["image"] = ["The file is empty."];
        }
        else if (image.Length > uploads.Value.MaxBytes)
        {
            errors["image"] = [$"The file is larger than {uploads.Value.MaxMegabytes} MB."];
        }
        else if (!ImageTypes.Contains(image.ContentType, StringComparer.OrdinalIgnoreCase))
        {
            errors["image"] = ["Use a PNG, JPEG or WebP image."];
        }
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        await using var stream = image.OpenReadStream();
        using var buffer = new MemoryStream((int)image.Length);
        await stream.CopyToAsync(buffer, ct);
        var name = Path.GetFileName(image.FileName);
        var input = new ComposeInput(
            Image: buffer.ToArray(),
            ImageFileName: string.IsNullOrWhiteSpace(name) ? "upload" : name,
            // Uploads are assumed to come from the same NASA animation, so use its legend.
            Colorbar: await File.ReadAllBytesAsync(catalog.Resolve(catalog.Default.Colorbar), ct),
            Mode: m,
            DurationSec: d,
            Sensitivity: s,
            SourceLabel: $"User upload: {Truncate(name, 120)}");
        return await Compose(input, sound, frame: null, ct);
    }

    private static async Task<IResult> Compose(ComposeInput input, SoundServiceClient sound, FrameView? frame, CancellationToken ct)
    {
        JsonObject result;
        try
        {
            result = await sound.ComposeAsync(input, ct);
        }
        catch (SoundServiceException e)
        {
            return Relay(e);
        }
        var id = result["id"]?.GetValue<string>() ?? string.Empty;
        if (!IdPattern().IsMatch(id))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway, title: "Sound service returned an invalid id");
        }
        RewriteArtifacts(result, id);
        result["frame"] = frame is null ? null : JsonSerializerNode(frame);
        return TypedResults.Content(result.ToJsonString(), "application/json");
    }

    private static async Task<IResult> GetArtifact(
        string id,
        string path,
        string? layers,
        bool? bed,
        HttpContext http,
        SoundServiceClient sound,
        CancellationToken ct)
    {
        if (!IdPattern().IsMatch(id) || !ArtifactPattern().IsMatch(path) || (layers is not null && !LayersPattern().IsMatch(layers)))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found");
        }

        var query = new List<string>();
        if (layers is not null) query.Add($"layers={Uri.EscapeDataString(layers)}");
        if (bed is not null) query.Add($"bed={(bed.Value ? "true" : "false")}");
        var target = $"v1/soundscapes/{id}/{path}" + (query.Count > 0 ? "?" + string.Join('&', query) : string.Empty);

        HttpResponseMessage upstream;
        try
        {
            upstream = await sound.GetArtifactAsync(target, ct);
        }
        catch (SoundServiceException e)
        {
            return Relay(e);
        }
        http.Response.RegisterForDispose(upstream);
        if (upstream.Headers.CacheControl is { } cache)
        {
            http.Response.Headers.CacheControl = cache.ToString();
        }
        var contentType = upstream.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        var stream = await upstream.Content.ReadAsStreamAsync(ct);
        var download = path.Replace('/', '-');
        return TypedResults.Stream(stream, contentType, fileDownloadName: path.EndsWith(".mid", StringComparison.Ordinal) ? download : null);
    }

    internal static void RewriteArtifacts(JsonObject result, string id, string basePath = "/api/soundscapes/")
    {
        if (result["artifacts"] is not JsonObject artifacts) return;
        var prefix = $"{basePath}{id}/";
        foreach (var key in artifacts.Select(p => p.Key).ToList())
        {
            switch (artifacts[key])
            {
                case JsonValue v when v.TryGetValue<string>(out var rel):
                    artifacts[key] = prefix + rel;
                    break;
                case JsonObject nested:
                    foreach (var inner in nested.Select(p => p.Key).ToList())
                    {
                        if (nested[inner] is JsonValue iv && iv.TryGetValue<string>(out var irel))
                        {
                            nested[inner] = prefix + irel;
                        }
                    }
                    break;
            }
        }
    }

    internal static IResult RelayError(SoundServiceException e) => Relay(e);

    // 4xx answers pass through, anything else becomes a 502.
    private static IResult Relay(SoundServiceException e)
    {
        var status = (int)e.Status;
        if (status is >= 400 and < 500 && status != 408)
        {
            return TypedResults.Content(e.Body, e.MediaType.Contains("json") ? e.MediaType : "text/plain", statusCode: status);
        }
        return TypedResults.Problem(
            statusCode: StatusCodes.Status502BadGateway,
            title: "The sound service failed",
            detail: "Try again in a moment.");
    }

    private static JsonNode? JsonSerializerNode(FrameView frame) =>
        System.Text.Json.JsonSerializer.SerializeToNode(frame, System.Text.Json.JsonSerializerOptions.Web);

    private static string Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? "image" : value.Length <= max ? value : value[..max];
}

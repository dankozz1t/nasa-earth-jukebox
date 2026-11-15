using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace EarthJukebox.Api.SoundService;

public sealed record SoundServiceOptions
{
    public const string Section = "SoundService";

    public Uri BaseUrl { get; init; } = new("http://127.0.0.1:8000/");

    // A 180 s scan takes several seconds of CPU.
    public int ComposeTimeoutSeconds { get; init; } = 120;
}

public sealed record ComposeInput(
    byte[] Image,
    string ImageFileName,
    byte[]? Colorbar,
    string Mode,
    double DurationSec,
    int Sensitivity,
    string SourceLabel);

public sealed class SoundServiceException(HttpStatusCode status, string body, string mediaType)
    : Exception($"Sound service returned {(int)status}")
{
    public HttpStatusCode Status { get; } = status;
    public string Body { get; } = body;
    public string MediaType { get; } = mediaType;
}

public sealed class SoundServiceClient(HttpClient http)
{
    public async Task<JsonObject> ComposeAsync(ComposeInput input, CancellationToken ct)
    {
        using var form = new MultipartFormDataContent();
        form.Add(ImagePart(input.Image), "image", input.ImageFileName);
        if (input.Colorbar is not null)
        {
            form.Add(ImagePart(input.Colorbar), "colorbar", "colorbar.png");
        }
        form.Add(new StringContent(input.Mode), "mode");
        form.Add(new StringContent(input.DurationSec.ToString(System.Globalization.CultureInfo.InvariantCulture)), "duration_sec");
        form.Add(new StringContent(input.Sensitivity.ToString(System.Globalization.CultureInfo.InvariantCulture)), "sensitivity");
        form.Add(new StringContent(input.SourceLabel), "source_label");

        using var response = await http.PostAsync("v1/soundscapes", form, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new SoundServiceException(response.StatusCode, body, MediaTypeOf(response));
        }
        return JsonNode.Parse(body) as JsonObject
            ?? throw new SoundServiceException(HttpStatusCode.BadGateway, "Sound service returned no JSON object", "text/plain");
    }

    // The caller disposes the response.
    public async Task<HttpResponseMessage> GetArtifactAsync(string relativePath, CancellationToken ct)
    {
        var response = await http.GetAsync(relativePath, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            var mediaType = MediaTypeOf(response);
            response.Dispose();
            throw new SoundServiceException(response.StatusCode, body, mediaType);
        }
        return response;
    }

    public async Task<string> GetAsync(string relativePath, CancellationToken ct)
    {
        using var response = await http.GetAsync(relativePath, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new SoundServiceException(response.StatusCode, body, MediaTypeOf(response));
        return body;
    }

    public async Task<JsonObject> PostJsonAsync(string relativePath, object payload, CancellationToken ct)
    {
        using var response = await http.PostAsJsonAsync(relativePath, payload, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new SoundServiceException(response.StatusCode, body, MediaTypeOf(response));
        return JsonNode.Parse(body) as JsonObject
            ?? throw new SoundServiceException(HttpStatusCode.BadGateway, "Sound service returned no JSON object", "text/plain");
    }

    public async Task<bool> IsHealthyAsync(CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync("health", ct);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return false;
        }
    }

    private static ByteArrayContent ImagePart(byte[] bytes)
    {
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return part;
    }

    private static string MediaTypeOf(HttpResponseMessage r) =>
        r.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
}

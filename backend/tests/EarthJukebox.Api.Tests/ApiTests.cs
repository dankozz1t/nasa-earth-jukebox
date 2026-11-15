using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using EarthJukebox.Api.SoundService;
using EarthJukebox.Api.Soundscapes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EarthJukebox.Api.Tests;

public sealed class StubSoundService : HttpMessageHandler
{
    public const string Id = "0123456789abcdef";
    public List<(HttpMethod Method, string Path, string Body)> Calls { get; } = [];
    public Func<HttpRequestMessage, HttpResponseMessage>? Override { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(ct);
        Calls.Add((request.Method, request.RequestUri!.PathAndQuery, body));
        if (Override is not null) return Override(request);

        var path = request.RequestUri!.AbsolutePath;
        if (path == "/health") return Json("""{"status":"ok"}""");
        if (request.Method == HttpMethod.Post && path == "/v1/soundscapes")
        {
            const string artifacts = """
                "artifacts":{"classMap":"classmap.png","mix":"mix.wav","midi":"score.mid",
                             "stems":{"dust":"stems/dust.wav","bed":"stems/bed.wav"}}
                """;
            return Json("{\"id\":\"" + Id + "\",\"bins\":4,\"notes\":[]," + artifacts + "}");
        }
        if (path == $"/v1/soundscapes/{Id}/mix.wav")
        {
            var wav = new ByteArrayContent(Encoding.ASCII.GetBytes("RIFF-fake-wav"));
            wav.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
            var ok = new HttpResponseMessage(HttpStatusCode.OK) { Content = wav };
            ok.Headers.CacheControl = new CacheControlHeaderValue { Public = true, MaxAge = TimeSpan.FromDays(1) };
            return ok;
        }
        return new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("""{"title":"Not found","status":404}""", Encoding.UTF8, "application/problem+json"),
        };
    }

    private static HttpResponseMessage Json(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public StubSoundService Stub { get; } = new();

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<SoundServiceClient>().ConfigurePrimaryHttpMessageHandler(() => Stub));
}

public sealed class ApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Frames_lists_the_nasa_frame_and_serves_its_image()
    {
        var frames = await _client.GetFromJsonAsync<JsonArray>("/api/frames");
        var first = frames![0]!.AsObject();
        Assert.Equal("svs-5669", first["id"]!.GetValue<string>());
        var image = await _client.GetAsync(first["imageUrl"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/png", image.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/frames/nope/image")).StatusCode);
    }

    [Fact]
    public async Task Compose_sends_frame_and_colorbar_and_rewrites_artifact_urls()
    {
        var response = await _client.PostAsJsonAsync("/api/soundscapes", new ComposeRequest("svs-5669", "raw", 32, 3));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = (await response.Content.ReadFromJsonAsync<JsonObject>())!;
        var artifacts = json["artifacts"]!.AsObject();
        Assert.Equal($"/api/soundscapes/{StubSoundService.Id}/mix.wav", artifacts["mix"]!.GetValue<string>());
        Assert.Equal($"/api/soundscapes/{StubSoundService.Id}/stems/dust.wav", artifacts["stems"]!["dust"]!.GetValue<string>());
        Assert.Equal("svs-5669", json["frame"]!["id"]!.GetValue<string>());

        var call = factory.Stub.Calls.Last(c => c.Method == HttpMethod.Post);
        Assert.Contains("name=image", call.Body);
        Assert.Contains("name=colorbar", call.Body);
        Assert.Contains("raw", call.Body);
    }

    [Theory]
    [InlineData("nope", "harmony", 64, 2, "frameId")]
    [InlineData("svs-5669", "jazz", 64, 2, "mode")]
    [InlineData("svs-5669", "harmony", 5, 2, "durationSec")]
    [InlineData("svs-5669", "harmony", 64, 9, "sensitivity")]
    public async Task Compose_validates_input(string frame, string mode, double duration, int sensitivity, string field)
    {
        var response = await _client.PostAsJsonAsync("/api/soundscapes", new ComposeRequest(frame, mode, duration, sensitivity));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = (await response.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.True(problem["errors"]!.AsObject().ContainsKey(field));
    }

    [Fact]
    public async Task Upload_rejects_non_images()
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent("hello"u8.ToArray());
        file.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        form.Add(file, "image", "notes.txt");
        var response = await _client.PostAsync("/api/soundscapes/upload", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Upload_forwards_png_with_the_default_colorbar()
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47]);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "image", "frame.png");
        form.Add(new StringContent("scale"), "mode");
        var response = await _client.PostAsync("/api/soundscapes/upload", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var call = factory.Stub.Calls.Last(c => c.Method == HttpMethod.Post);
        Assert.Contains("name=colorbar", call.Body);
        Assert.Contains("User upload: frame.png", call.Body);
    }

    [Fact]
    public async Task Artifacts_are_proxied_with_whitelisted_query()
    {
        var response = await _client.GetAsync($"/api/soundscapes/{StubSoundService.Id}/mix.wav?layers=dust,sulfate&bed=false&evil=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("audio/wav", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("RIFF-fake-wav", await response.Content.ReadAsStringAsync());
        Assert.Contains("max-age=86400", response.Headers.CacheControl!.ToString());
        var call = factory.Stub.Calls.Last();
        Assert.Equal($"/v1/soundscapes/{StubSoundService.Id}/mix.wav?layers=dust%2Csulfate&bed=false", call.Path);
    }

    [Theory]
    [InlineData("/api/soundscapes/0123456789abcdef/stems/..%2F..%2Fhealth.wav")]
    [InlineData("/api/soundscapes/0123456789abcdef/docs")]
    [InlineData("/api/soundscapes/NOT-AN-ID/mix.wav")]
    [InlineData("/api/soundscapes/0123456789abcdef/mix.wav?layers=<script>")]
    public async Task Artifact_proxy_refuses_anything_else(string url)
    {
        var before = factory.Stub.Calls.Count;
        var response = await _client.GetAsync(url);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(before, factory.Stub.Calls.Count); // the request never reached the sound service
    }

    [Fact]
    public async Task Sound_service_errors_are_relayed_or_hidden()
    {
        factory.Stub.Override = _ => new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("""{"title":"Invalid input","detail":"could not read the image"}""", Encoding.UTF8, "application/problem+json"),
        };
        var bad = await _client.PostAsJsonAsync("/api/soundscapes", new ComposeRequest("svs-5669"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Contains("could not read the image", await bad.Content.ReadAsStringAsync());

        factory.Stub.Override = _ => new HttpResponseMessage(HttpStatusCode.InternalServerError) { Content = new StringContent("Traceback ...") };
        var broken = await _client.PostAsJsonAsync("/api/soundscapes", new ComposeRequest("svs-5669"));
        Assert.Equal(HttpStatusCode.BadGateway, broken.StatusCode);
        Assert.DoesNotContain("Traceback", await broken.Content.ReadAsStringAsync());
        factory.Stub.Override = null;
    }

    [Fact]
    public async Task Health_reports_the_sound_service()
    {
        var response = await _client.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.Equal("ok", response!["soundService"]!.GetValue<string>());
    }

    [Fact]
    public void Rewrite_handles_nested_stems()
    {
        var json = JsonNode.Parse("""{"artifacts":{"mix":"mix.wav","stems":{"bed":"stems/bed.wav"}}}""")!.AsObject();
        SoundscapeEndpoints.RewriteArtifacts(json, "abc");
        Assert.Equal("/api/soundscapes/abc/stems/bed.wav", json["artifacts"]!["stems"]!["bed"]!.GetValue<string>());
    }
}

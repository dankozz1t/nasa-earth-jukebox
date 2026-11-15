using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using EarthJukebox.Api.SoundService;
using EarthJukebox.Api.Weather;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EarthJukebox.Api.Tests;

public sealed class StubWeather : HttpMessageHandler
{
    public const string Id = "fedcba9876543210";
    public List<(HttpMethod Method, string Path, string Body)> Calls { get; } = [];
    public bool GibsReturnsXml { get; set; }
    public string GridJson { get; set; } = """{"lats":[0],"lons":[0],"values":{}}""";
    public string ReadingsJson { get; set; } = """{"readings":[]}""";
    public bool GridFails { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(ct);
        var uri = request.RequestUri!;
        Calls.Add((request.Method, uri.PathAndQuery, body));
        if (uri.Host == "gibs.earthdata.nasa.gov")
        {
            var content = GibsReturnsXml
                ? new StringContent("<ServiceException/>", Encoding.UTF8, "text/xml")
                : new ByteArrayContent([0xFF, 0xD8, 0xFF]);
            if (!GibsReturnsXml) content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = content };
        }
        return uri.AbsolutePath switch
        {
            "/v1/weather/sections" => Json("""[{"key":"temperature"}]"""),
            "/v1/weather/grid" when GridFails => new HttpResponseMessage(HttpStatusCode.InternalServerError),
            "/v1/weather/grid" => Json(GridJson),
            "/v1/weather/readings" => Json(ReadingsJson),
            "/v1/weather/composer" => Json("""{"aiAvailable":false}"""),
            "/v1/weather/soundscapes" => Json("{\"id\":\"" + Id + "\",\"artifacts\":{\"mix\":\"mix.wav\",\"stems\":{\"lead\":\"stems/lead.wav\"}}}"),
            var p when p == $"/v1/weather/soundscapes/{Id}/mix.wav" => Wav(),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("""{"title":"Not found"}""", Encoding.UTF8, "application/problem+json") },
        };
    }

    private static HttpResponseMessage Json(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static HttpResponseMessage Wav()
    {
        var c = new ByteArrayContent("RIFF"u8.ToArray());
        c.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = c };
    }
}

public sealed class WeatherFactory : WebApplicationFactory<Program>
{
    public StubWeather Stub { get; } = new();

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services =>
        {
            services.AddHttpClient<SoundServiceClient>().ConfigurePrimaryHttpMessageHandler(() => Stub);
            services.AddHttpClient(NasaBasemap.ClientName).ConfigurePrimaryHttpMessageHandler(() => Stub);
        });
}

public sealed class WeatherTests(WeatherFactory factory) : IClassFixture<WeatherFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Reads_are_relayed()
    {
        Assert.Equal("temperature", (await _client.GetFromJsonAsync<JsonArray>("/api/weather/sections"))![0]!["key"]!.GetValue<string>());
        Assert.NotNull(await _client.GetFromJsonAsync<JsonObject>("/api/weather/grid"));
        Assert.NotNull(await _client.GetFromJsonAsync<JsonObject>("/api/weather/readings"));
        Assert.False((await _client.GetFromJsonAsync<JsonObject>("/api/weather/composer"))!["aiAvailable"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Compose_forwards_json_and_rewrites_urls()
    {
        var r = await _client.PostAsJsonAsync("/api/weather/soundscapes", new WeatherComposeRequest("precipitation", 4, 0.5, 40, "ai"));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = (await r.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal($"/api/weather/soundscapes/{StubWeather.Id}/mix.wav", json["artifacts"]!["mix"]!.GetValue<string>());
        Assert.Equal($"/api/weather/soundscapes/{StubWeather.Id}/stems/lead.wav", json["artifacts"]!["stems"]!["lead"]!.GetValue<string>());
        var call = factory.Stub.Calls.Last(c => c.Method == HttpMethod.Post);
        Assert.Contains("\"section\":\"precipitation\"", call.Body);
        Assert.Contains("\"durationSec\":40", call.Body);
        Assert.Contains("\"composer\":\"ai\"", call.Body);
    }

    [Theory]
    [InlineData("pollen", 3, 0.8, 60, "auto", "section")]
    [InlineData("wind", 40, 0.8, 60, "auto", "cycles")]
    [InlineData("wind", 3, 2, 60, "auto", "amplitude")]
    [InlineData("wind", 3, 0.8, 5, "auto", "durationSec")]
    [InlineData("wind", 3, 0.8, 60, "gpt", "composer")]
    public async Task Compose_validates(string section, double cycles, double amplitude, double duration, string composer, string field)
    {
        var r = await _client.PostAsJsonAsync("/api/weather/soundscapes", new WeatherComposeRequest(section, cycles, amplitude, duration, composer));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.True((await r.Content.ReadFromJsonAsync<JsonObject>())!["errors"]!.AsObject().ContainsKey(field));
    }

    [Fact]
    public async Task Artifacts_are_proxied_with_parts_only()
    {
        var r = await _client.GetAsync($"/api/weather/soundscapes/{StubWeather.Id}/mix.wav?parts=lead,bass&evil=1");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal($"/v1/weather/soundscapes/{StubWeather.Id}/mix.wav?parts=lead%2Cbass", factory.Stub.Calls.Last().Path);
        await _client.GetAsync($"/api/weather/soundscapes/{StubWeather.Id}/mix.wav?mono=true");
        Assert.Equal($"/v1/weather/soundscapes/{StubWeather.Id}/mix.wav?mono=true", factory.Stub.Calls.Last().Path);
    }

    [Theory]
    [InlineData("/api/weather/soundscapes/fedcba9876543210/score.mid")]
    [InlineData("/api/weather/soundscapes/fedcba9876543210/stems/..%2F..%2Fgrid.wav")]
    [InlineData("/api/weather/soundscapes/nope/mix.wav")]
    [InlineData("/api/weather/soundscapes/fedcba9876543210/mix.wav?parts=<x>")]
    public async Task Artifact_proxy_refuses_anything_else(string url)
    {
        var before = factory.Stub.Calls.Count;
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync(url)).StatusCode);
        Assert.Equal(before, factory.Stub.Calls.Count);
    }

    [Theory]
    [InlineData("/api/weather/sections", 86400)]
    [InlineData("/api/weather/composer", 300)]
    public async Task Config_reads_are_cacheable_and_revalidate_with_304(string url, int seconds)
    {
        var r = await _client.GetAsync(url);
        Assert.True(r.Headers.CacheControl!.Public);
        Assert.Equal(TimeSpan.FromSeconds(seconds), r.Headers.CacheControl.MaxAge);
        Assert.NotNull(r.Headers.ETag);

        var again = new HttpRequestMessage(HttpMethod.Get, url);
        again.Headers.IfNoneMatch.Add(r.Headers.ETag!);
        var notModified = await _client.SendAsync(again);
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Empty(await notModified.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Grid_and_readings_expire_at_the_next_update()
    {
        var next = DateTimeOffset.UtcNow.AddMinutes(10).ToString("O");
        factory.Stub.GridJson = $$"""{"values":{},"isSnapshot":false,"nextUpdateAt":"{{next}}"}""";
        factory.Stub.ReadingsJson = """{"readings":[{"observedAt":"2026-11-15T10:00","isSnapshot":false}]}""";
        var grid = (await _client.GetAsync("/api/weather/grid")).Headers.CacheControl!;
        var readings = (await _client.GetAsync("/api/weather/readings")).Headers.CacheControl!;
        Assert.True(grid.Public);
        Assert.InRange(grid.MaxAge!.Value.TotalSeconds, 590, 600);
        Assert.InRange(readings.MaxAge!.Value.TotalSeconds, 590, 600);

        factory.Stub.GridJson = $$"""{"values":{},"isSnapshot":true,"nextUpdateAt":"{{next}}"}""";
        Assert.Equal(TimeSpan.FromSeconds(60), (await _client.GetAsync("/api/weather/grid")).Headers.CacheControl!.MaxAge);
        Assert.Equal(TimeSpan.FromSeconds(60), (await _client.GetAsync("/api/weather/readings")).Headers.CacheControl!.MaxAge);
    }

    [Theory]
    [InlineData(-120, 0)] // refresh running: look again on the next poll
    [InlineData(90, 90)]
    [InlineData(6 * 3600, 1800)] // daily budget spent, next update at midnight
    public void Max_age_runs_until_the_next_update_within_bounds(int dueInSeconds, int expected)
    {
        var now = new DateTimeOffset(2026, 11, 15, 10, 0, 0, TimeSpan.Zero);
        Assert.Equal(TimeSpan.FromSeconds(expected), WeatherSchedule.MaxAge(now.AddSeconds(dueInSeconds), now));
        Assert.Equal(WeatherSchedule.Fallback, WeatherSchedule.MaxAge(null, now));
    }

    [Theory]
    [InlineData("""{"isSnapshot":false,"nextUpdateAt":"2026-11-15T10:31:30Z"}""", true)]
    [InlineData("""{"isSnapshot":true,"nextUpdateAt":"2026-11-15T10:31:30Z"}""", false)]
    [InlineData("""{"isSnapshot":false,"nextUpdateAt":null}""", false)]
    [InlineData("not json", false)]
    public void Only_a_live_grid_sets_the_schedule(string json, bool live)
    {
        Assert.Equal(live, WeatherSchedule.LiveNextUpdate(json) is not null);
    }

    [Fact]
    public async Task Errors_and_compositions_are_not_cached()
    {
        factory.Stub.GridFails = true;
        try
        {
            var failed = await _client.GetAsync("/api/weather/grid");
            Assert.Equal(HttpStatusCode.BadGateway, failed.StatusCode);
            Assert.Null(failed.Headers.CacheControl?.MaxAge);
            Assert.Null(failed.Headers.ETag);
        }
        finally
        {
            factory.Stub.GridFails = false;
        }
        var composed = await _client.PostAsJsonAsync("/api/weather/soundscapes", new WeatherComposeRequest(Composer: "algorithmic"));
        Assert.Equal(HttpStatusCode.OK, composed.StatusCode);
        Assert.Null(composed.Headers.CacheControl);
        var invalid = await _client.PostAsJsonAsync("/api/weather/soundscapes", new WeatherComposeRequest(Section: "pollen"));
        Assert.Null(invalid.Headers.CacheControl);
    }

    [Fact]
    public async Task Basemap_is_cached_and_xml_errors_are_rejected()
    {
        factory.Stub.GibsReturnsXml = true;
        var bad = await _client.GetAsync("/api/weather/basemap");
        Assert.Equal(HttpStatusCode.BadGateway, bad.StatusCode);

        factory.Stub.GibsReturnsXml = false;
        var ok = await _client.GetAsync("/api/weather/basemap");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal("image/jpeg", ok.Content.Headers.ContentType!.MediaType);
        Assert.Null(bad.Headers.CacheControl?.MaxAge);
        Assert.Equal(TimeSpan.FromDays(1), ok.Headers.CacheControl!.MaxAge);
        Assert.True(ok.Headers.CacheControl.Public);
        Assert.NotNull(ok.Content.Headers.LastModified);
        var again = new HttpRequestMessage(HttpMethod.Get, "/api/weather/basemap");
        again.Headers.IfNoneMatch.Add(ok.Headers.ETag!);
        Assert.Equal(HttpStatusCode.NotModified, (await _client.SendAsync(again)).StatusCode);
        var gibsCalls = factory.Stub.Calls.Count(c => c.Path.Contains("wms.cgi"));
        await _client.GetAsync("/api/weather/basemap");
        Assert.Equal(gibsCalls, factory.Stub.Calls.Count(c => c.Path.Contains("wms.cgi"))); // second call comes from the cache
    }
}

public sealed class AiQuotaFactory : WebApplicationFactory<Program>
{
    public StubWeather Stub { get; } = new();

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseSetting("RateLimit:AiComposePerHour", "1");
        builder.ConfigureTestServices(services =>
        {
            services.AddHttpClient<SoundServiceClient>().ConfigurePrimaryHttpMessageHandler(() => Stub);
            services.AddTransient<Microsoft.AspNetCore.Hosting.IStartupFilter, TestPeerFilter>();
        });
    }
}

public sealed class AiQuotaTests(AiQuotaFactory factory) : IClassFixture<AiQuotaFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<JsonNode> Compose(string peer, string composer)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/weather/soundscapes")
        {
            Content = JsonContent.Create(new WeatherComposeRequest(Composer: composer)),
        };
        request.Headers.Add(TestPeerFilter.Header, peer);
        var r = await _client.SendAsync(request);
        r.EnsureSuccessStatusCode();
        return JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
    }

    private string LastComposer() => JsonNode.Parse(factory.Stub.Calls.Last().Body)!["composer"]!.GetValue<string>();

    [Fact]
    public async Task Past_the_hourly_ai_limit_a_visitor_gets_the_rules_composer_with_a_warning()
    {
        var first = await Compose("198.51.100.1", "ai");
        Assert.Equal("ai", LastComposer());
        Assert.Null(first["warnings"]);

        var second = await Compose("198.51.100.1", "ai");
        Assert.Equal("algorithmic", LastComposer());
        Assert.Contains("AI limit", second["warnings"]![0]!.GetValue<string>());

        await Compose("198.51.100.1", "algorithmic"); // rules never use the AI budget
        Assert.Equal("algorithmic", LastComposer());

        await Compose("198.51.100.2", "ai"); // another visitor has their own budget
        Assert.Equal("ai", LastComposer());
    }
}

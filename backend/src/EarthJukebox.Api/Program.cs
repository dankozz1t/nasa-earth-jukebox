using System.Net;
using System.Threading.RateLimiting;
using EarthJukebox.Api.Frames;
using EarthJukebox.Api.SoundService;
using EarthJukebox.Api.Soundscapes;
using EarthJukebox.Api.Weather;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddOutputCache();
builder.Services.AddOpenApi();

builder.Services.Configure<SoundServiceOptions>(builder.Configuration.GetSection(SoundServiceOptions.Section));
builder.Services.Configure<FramesOptions>(builder.Configuration.GetSection(FramesOptions.Section));
builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection(UploadOptions.Section));

builder.Services.AddSingleton(sp =>
    FrameCatalog.Load(builder.Environment.ContentRootPath, sp.GetRequiredService<IOptions<FramesOptions>>().Value));

builder.Services.AddHttpClient<SoundServiceClient>((sp, http) =>
{
    var options = sp.GetRequiredService<IOptions<SoundServiceOptions>>().Value;
    http.BaseAddress = options.BaseUrl;
    http.Timeout = TimeSpan.FromSeconds(options.ComposeTimeoutSeconds);
});

builder.Services.Configure<BasemapOptions>(builder.Configuration.GetSection(BasemapOptions.Section));
builder.Services.AddHttpClient(NasaBasemap.ClientName, http =>
{
    http.Timeout = TimeSpan.FromSeconds(30);
    http.DefaultRequestHeaders.UserAgent.ParseAdd("EarthJukebox/0.3 (NASA Space Apps prototype)");
});
builder.Services.AddSingleton(sp => new NasaBasemap(
    sp.GetRequiredService<IHttpClientFactory>(),
    sp.GetRequiredService<IOptions<BasemapOptions>>(),
    sp.GetRequiredService<ILogger<NasaBasemap>>()));

var uploadLimit = builder.Configuration.GetValue("Uploads:MaxMegabytes", 25) * 1024L * 1024L;
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = uploadLimit + 64 * 1024);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = uploadLimit + 64 * 1024);

// Behind nginx every request comes from the proxy. Read the visitor's address from X-Forwarded-For,
// but only from a loopback or private-network hop, and only one hop deep.
builder.Services.AddOptions<ForwardedHeadersOptions>().Configure(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    o.KnownProxies.Clear();
    o.KnownIPNetworks.Clear();
    foreach (var network in TrustedProxyNetworks) o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
});

builder.Services.AddSingleton<AiQuota>();

// Composing renders audio, so limit it per client address. The limit is read per request so tests can change it.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(SoundscapeEndpoints.ComposePolicy, http =>
    {
        var perMinute = http.RequestServices.GetRequiredService<IConfiguration>().GetValue("RateLimit:ComposePerMinute", 60);
        return RateLimitPartition.GetFixedWindowLimiter(
            http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) });
    });
});

var app = builder.Build();

app.UseForwardedHeaders(); // must come first so the rate limiter sees the visitor, not nginx
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();
app.UseOutputCache();

// Load the catalog at startup so a broken Data folder fails the deploy, not the first visitor.
app.Services.GetRequiredService<FrameCatalog>();

app.MapOpenApi("/api/openapi.json");
app.MapGet("/api/health", async (SoundServiceClient sound, CancellationToken ct) =>
    {
        var soundOk = await sound.IsHealthyAsync(ct);
        return TypedResults.Json(
            new { status = soundOk ? "ok" : "degraded", soundService = soundOk ? "ok" : "unavailable" },
            statusCode: soundOk ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    })
    .WithTags("Health");
app.MapFrames();
app.MapSoundscapes();
app.MapWeather();

app.Run();

public partial class Program
{
    // Hops allowed to set X-Forwarded-For: loopback and private ranges (the Docker network).
    internal static readonly string[] TrustedProxyNetworks =
        ["127.0.0.0/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7", "fe80::/10"];
}

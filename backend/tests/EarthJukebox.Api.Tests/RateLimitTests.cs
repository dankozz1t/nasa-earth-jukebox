using System.Net;
using System.Net.Http.Json;
using EarthJukebox.Api.SoundService;
using EarthJukebox.Api.Soundscapes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EarthJukebox.Api.Tests;

// The test server has no TCP peer, so this filter sets RemoteIpAddress from the X-Test-Peer header.
internal sealed class TestPeerFilter : IStartupFilter
{
    public const string Header = "X-Test-Peer";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use((ctx, nextMiddleware) =>
        {
            if (ctx.Request.Headers.TryGetValue(Header, out var peer)) ctx.Connection.RemoteIpAddress = IPAddress.Parse(peer!);
            return nextMiddleware(ctx);
        });
        next(app);
    };
}

public sealed class RateLimitFactory : WebApplicationFactory<Program>
{
    public StubSoundService Stub { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("RateLimit:ComposePerMinute", "2");
        builder.ConfigureTestServices(services =>
        {
            services.AddHttpClient<SoundServiceClient>().ConfigurePrimaryHttpMessageHandler(() => Stub);
            services.AddTransient<IStartupFilter, TestPeerFilter>();
        });
    }
}

public sealed class RateLimitTests(RateLimitFactory factory) : IClassFixture<RateLimitFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private Task<HttpResponseMessage> Compose(string peer, string? forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/soundscapes")
        {
            Content = JsonContent.Create(new ComposeRequest("svs-5669")),
        };
        request.Headers.Add(TestPeerFilter.Header, peer);
        if (forwardedFor is not null) request.Headers.Add("X-Forwarded-For", forwardedFor);
        return _client.SendAsync(request);
    }

    [Fact]
    public async Task Behind_nginx_each_visitor_has_their_own_compose_budget()
    {
        const string nginx = "172.18.0.3";
        Assert.Equal(HttpStatusCode.OK, (await Compose(nginx, "203.0.113.7")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Compose(nginx, "203.0.113.7")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Compose(nginx, "203.0.113.7")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Compose(nginx, "203.0.113.8")).StatusCode);
    }

    [Fact]
    public async Task X_Forwarded_For_from_an_untrusted_peer_is_ignored()
    {
        const string outsider = "198.51.100.20"; // public address, not a trusted proxy
        Assert.Equal(HttpStatusCode.OK, (await Compose(outsider, "203.0.113.50")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Compose(outsider, "203.0.113.51")).StatusCode);
        // The spoofed header gets no new budget; the limit follows the real peer.
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Compose(outsider, "203.0.113.52")).StatusCode);
    }
}

public sealed class RateLimitDefaultsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public void Compose_limit_defaults_to_60_per_minute()
    {
        var config = factory.Services.GetRequiredService<IConfiguration>();
        Assert.Equal(60, config.GetValue<int>("RateLimit:ComposePerMinute"));
    }
}

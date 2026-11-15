namespace EarthJukebox.Api.Weather;

public sealed record BasemapOptions
{
    public const string Section = "Basemap";

    // Whole planet in EPSG:4326 (equirectangular). No API key needed.
    public Uri Url { get; init; } = new(
        "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
        "&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180" +
        "&WIDTH=1440&HEIGHT=720&FORMAT=image/jpeg");

    public int CacheHours { get; init; } = 24;
}

// Cached in memory. If a refresh fails, the old image stays.
public sealed class NasaBasemap(IHttpClientFactory clients, Microsoft.Extensions.Options.IOptions<BasemapOptions> options, ILogger<NasaBasemap> logger)
{
    public const string ClientName = "nasa-gibs";
    private readonly SemaphoreSlim _lock = new(1, 1);
    private byte[]? _image;
    private DateTimeOffset _fetchedAt;

    public async Task<byte[]?> GetAsync(CancellationToken ct)
    {
        if (_image is not null && DateTimeOffset.UtcNow - _fetchedAt < TimeSpan.FromHours(options.Value.CacheHours)) return _image;
        await _lock.WaitAsync(ct);
        try
        {
            if (_image is not null && DateTimeOffset.UtcNow - _fetchedAt < TimeSpan.FromHours(options.Value.CacheHours)) return _image;
            var http = clients.CreateClient(ClientName);
            using var response = await http.GetAsync(options.Value.Url, ct);
            var type = response.Content.Headers.ContentType?.MediaType;
            if (!response.IsSuccessStatusCode || type is not "image/jpeg")
            {
                // GIBS can return a WMS error as XML with status 200, so check the type.
                logger.LogWarning("NASA GIBS basemap failed: {Status} {Type}", (int)response.StatusCode, type);
                return _image;
            }
            _image = await response.Content.ReadAsByteArrayAsync(ct);
            _fetchedAt = DateTimeOffset.UtcNow;
            return _image;
        }
        catch (HttpRequestException e)
        {
            logger.LogWarning(e, "NASA GIBS basemap is unreachable");
            return _image;
        }
        finally
        {
            _lock.Release();
        }
    }
}

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Net.Http.Headers;

namespace EarthJukebox.Api.Http;

// Browser and CDN caching. Call these only on the success path, so errors never carry a long max-age.
public static class CacheHeaders
{
    public static readonly TimeSpan Catalog = TimeSpan.FromHours(1);
    public static readonly TimeSpan Image = TimeSpan.FromDays(1);
    public static readonly TimeSpan StaticConfig = TimeSpan.FromDays(1);
    public static readonly TimeSpan ServerConfig = TimeSpan.FromMinutes(5);

    public static void SetPublic(HttpResponse response, TimeSpan maxAge) =>
        response.Headers.CacheControl = "public, max-age=" +
            ((long)Math.Max(0, maxAge.TotalSeconds)).ToString(CultureInfo.InvariantCulture);

    // Weak, because nginx gzips JSON and that changes the bytes, not the meaning.
    public static EntityTagHeaderValue JsonTag(string body) =>
        new($"\"{Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(body)).AsSpan(0, 8))}\"", isWeak: true);

    public static EntityTagHeaderValue BytesTag(byte[] body) =>
        new($"\"{Convert.ToHexStringLower(SHA256.HashData(body).AsSpan(0, 8))}\"");

    public static EntityTagHeaderValue FileTag(FileInfo file) =>
        new($"\"{file.Length:x}-{file.LastWriteTimeUtc.Ticks:x}\"");

    // JSON with Cache-Control and an ETag; a matching If-None-Match gets a bodiless 304.
    public static IResult Json(HttpContext http, string body, TimeSpan maxAge)
    {
        var tag = JsonTag(body);
        SetPublic(http.Response, maxAge);
        http.Response.Headers.ETag = tag.ToString();
        var ifNoneMatch = http.Request.GetTypedHeaders().IfNoneMatch;
        return ifNoneMatch.Any(t => t.Equals(EntityTagHeaderValue.Any) || t.Compare(tag, useStrongComparison: false))
            ? TypedResults.StatusCode(StatusCodes.Status304NotModified)
            : TypedResults.Content(body, "application/json");
    }
}

using EarthJukebox.Api.Http;

namespace EarthJukebox.Api.Frames;

public static class FrameEndpoints
{
    public static IEndpointRouteBuilder MapFrames(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/frames").WithTags("Frames");

        // The catalog is read once at startup, so it changes only with a deploy.
        group.MapGet("/", (FrameCatalog catalog, HttpContext http) =>
            {
                CacheHeaders.SetPublic(http.Response, CacheHeaders.Catalog);
                return TypedResults.Ok(catalog.All.Select(FrameCatalog.ToView));
            })
            .WithSummary("NASA frames available in the jukebox");

        group.MapGet("/{id}/image", IResult (string id, FrameCatalog catalog, HttpContext http) =>
            {
                if (!catalog.TryGet(id, out var frame))
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Frame not found");
                }
                var file = new FileInfo(catalog.Resolve(frame.Image));
                CacheHeaders.SetPublic(http.Response, CacheHeaders.Image);
                return TypedResults.PhysicalFile(file.FullName, "image/png",
                    lastModified: file.LastWriteTimeUtc, entityTag: CacheHeaders.FileTag(file), enableRangeProcessing: true);
            })
            .WithSummary("The frame image (PNG)")
            .CacheOutput(p => p.Expire(TimeSpan.FromHours(1)));

        return app;
    }
}

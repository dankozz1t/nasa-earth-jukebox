namespace EarthJukebox.Api.Frames;

public static class FrameEndpoints
{
    public static IEndpointRouteBuilder MapFrames(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/frames").WithTags("Frames");

        group.MapGet("/", (FrameCatalog catalog) => TypedResults.Ok(catalog.All.Select(FrameCatalog.ToView)))
            .WithSummary("NASA frames available in the jukebox");

        group.MapGet("/{id}/image", IResult (string id, FrameCatalog catalog) =>
            catalog.TryGet(id, out var frame)
                ? TypedResults.PhysicalFile(catalog.Resolve(frame.Image), "image/png", enableRangeProcessing: true)
                : TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Frame not found"))
            .WithSummary("The frame image (PNG)")
            .CacheOutput(p => p.Expire(TimeSpan.FromHours(1)));

        return app;
    }
}

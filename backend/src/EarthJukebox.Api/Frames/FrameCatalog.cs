using System.Text.Json;

namespace EarthJukebox.Api.Frames;

public sealed record FramesOptions
{
    public const string Section = "Frames";

    public string Directory { get; init; } = "Data/frames";
}

public sealed record FrameEntry(
    string Id,
    string Title,
    string Source,
    string PageUrl,
    string TimestampUtc,
    string Image,
    string Colorbar);

public sealed record FrameView(
    string Id,
    string Title,
    string Source,
    string PageUrl,
    string TimestampUtc,
    string ImageUrl);

public sealed class FrameCatalog
{
    private readonly string _root;
    private readonly IReadOnlyDictionary<string, FrameEntry> _frames;

    public FrameCatalog(string root, IReadOnlyList<FrameEntry> frames)
    {
        _root = Path.GetFullPath(root);
        _frames = frames.ToDictionary(f => f.Id, StringComparer.Ordinal);
        foreach (var frame in frames)
        {
            if (!File.Exists(Resolve(frame.Image)) || !File.Exists(Resolve(frame.Colorbar)))
            {
                throw new InvalidOperationException($"Frame '{frame.Id}' points to a missing image or colour bar.");
            }
        }
        Default = frames.Count > 0 ? frames[0] : throw new InvalidOperationException("The frame catalog is empty.");
    }

    public FrameEntry Default { get; }

    public IEnumerable<FrameEntry> All => _frames.Values;

    public static FrameCatalog Load(string contentRoot, FramesOptions options)
    {
        var root = Path.Combine(contentRoot, options.Directory);
        var json = File.ReadAllText(Path.Combine(root, "catalog.json"));
        var frames = JsonSerializer.Deserialize<List<FrameEntry>>(json, JsonSerializerOptions.Web)
            ?? throw new InvalidOperationException("catalog.json is empty.");
        return new FrameCatalog(root, frames);
    }

    public bool TryGet(string id, out FrameEntry frame) => _frames.TryGetValue(id, out frame!);

    // Catalog paths must not escape the frames folder.
    public string Resolve(string relative)
    {
        var full = Path.GetFullPath(Path.Combine(_root, relative));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Catalog path escapes the frames folder: {relative}");
        }
        return full;
    }

    public static FrameView ToView(FrameEntry f) =>
        new(f.Id, f.Title, f.Source, f.PageUrl, f.TimestampUtc, $"/api/frames/{Uri.EscapeDataString(f.Id)}/image");
}

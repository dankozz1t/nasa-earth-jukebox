using System.Globalization;
using System.Text.Json;

namespace EarthJukebox.Api.Weather;

// How long a weather answer stays fresh: until the sound service's next grid update.
// Readings carry no update time, so the last relayed grid's nextUpdateAt is remembered for them.
public sealed class WeatherSchedule
{
    public static readonly TimeSpan Fallback = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan Longest = TimeSpan.FromMinutes(30);

    private long _nextUpdateTicks; // UTC ticks, 0 when unknown or a snapshot

    public TimeSpan ForGrid(string json, DateTimeOffset now)
    {
        var next = LiveNextUpdate(json);
        Interlocked.Exchange(ref _nextUpdateTicks, next?.UtcTicks ?? 0);
        return MaxAge(next, now);
    }

    public TimeSpan ForReadings(string json, DateTimeOffset now)
    {
        var ticks = Interlocked.Read(ref _nextUpdateTicks);
        return ticks == 0 || LatestReadingIsSnapshot(json) ? Fallback : MaxAge(new DateTimeOffset(ticks, TimeSpan.Zero), now);
    }

    // A due time in the past means a refresh is running: max-age 0, so the next poll sees the new grid.
    internal static TimeSpan MaxAge(DateTimeOffset? next, DateTimeOffset now)
    {
        if (next is null) return Fallback;
        var left = next.Value - now;
        return left < TimeSpan.Zero ? TimeSpan.Zero : left > Longest ? Longest : TimeSpan.FromSeconds(Math.Floor(left.TotalSeconds));
    }

    // Snapshots retry within a minute, so their nextUpdateAt is not a schedule to cache by.
    internal static DateTimeOffset? LiveNextUpdate(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("isSnapshot", out var snap) || snap.ValueKind != JsonValueKind.False) return null;
            if (!root.TryGetProperty("nextUpdateAt", out var next) || next.ValueKind != JsonValueKind.String) return null;
            return DateTimeOffset.TryParse(next.GetString(), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var at) ? at : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool LatestReadingIsSnapshot(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("readings", out var readings)
                || readings.ValueKind != JsonValueKind.Array
                || readings.GetArrayLength() == 0) return true;
            var last = readings[readings.GetArrayLength() - 1];
            return last.ValueKind != JsonValueKind.Object
                || !last.TryGetProperty("isSnapshot", out var snap)
                || snap.ValueKind != JsonValueKind.False;
        }
        catch (JsonException)
        {
            return true;
        }
    }
}

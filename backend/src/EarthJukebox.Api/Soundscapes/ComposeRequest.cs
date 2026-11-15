namespace EarthJukebox.Api.Soundscapes;

public sealed record ComposeRequest(
    string FrameId,
    string Mode = "harmony",
    double DurationSec = 64,
    int Sensitivity = 2);

public static class ComposeRules
{
    public static readonly string[] Modes = ["raw", "scale", "harmony"];
    public const double MinDuration = 10;
    public const double MaxDuration = 180;
    public const int MaxSensitivity = 4;

    public static Dictionary<string, string[]> Validate(string mode, double durationSec, int sensitivity)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Modes.Contains(mode, StringComparer.Ordinal))
        {
            errors["mode"] = [$"Must be one of: {string.Join(", ", Modes)}."];
        }
        if (double.IsNaN(durationSec) || durationSec < MinDuration || durationSec > MaxDuration)
        {
            errors["durationSec"] = [$"Must be between {MinDuration} and {MaxDuration} seconds."];
        }
        if (sensitivity is < 0 or > MaxSensitivity)
        {
            errors["sensitivity"] = [$"Must be between 0 and {MaxSensitivity}."];
        }
        return errors;
    }
}

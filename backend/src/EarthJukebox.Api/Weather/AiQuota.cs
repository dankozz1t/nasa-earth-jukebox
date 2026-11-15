using System.Threading.RateLimiting;

namespace EarthJukebox.Api.Weather;

// AI compositions are paid calls, so each visitor gets a few per hour. Past that the request goes to the rules composer.
public sealed class AiQuota(IConfiguration config) : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limiter = PartitionedRateLimiter.Create<string, string>(visitor =>
        RateLimitPartition.GetFixedWindowLimiter(visitor, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = config.GetValue("RateLimit:AiComposePerHour", 10),
            Window = TimeSpan.FromHours(1),
        }));

    public bool TryTake(string visitor)
    {
        using var lease = _limiter.AttemptAcquire(visitor);
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}

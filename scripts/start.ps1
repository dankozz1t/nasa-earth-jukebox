# Build and start the whole app in Docker, wait until it is healthy.
# Usage: .\scripts\start.ps1 [-h|--help]
. "$PSScriptRoot/_common.ps1"
if ($args -contains '-h' -or $args -contains '--help') { Show-Usage $PSCommandPath; exit 0 }
Assert-Docker

if (Test-Path (Join-Path $RootDir '.env')) { 'Settings: .env' }
else { 'Settings: defaults (no .env, AI composer off)' }

Invoke-Compose up -d --build

$address = (Invoke-Compose port frontend 80 | Select-Object -Last 1)
$url = "http://localhost:$($address.Split(':')[-1])"
"Waiting for $url/api/health ..."
for ($i = 0; $i -lt 90; $i++) {
    try {
        Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 3 | Out-Null
        "Earth Jukebox is up: $url"
        exit 0
    } catch { Start-Sleep -Seconds 2 }
}
Write-Error 'Not healthy after 3 minutes. Check: .\scripts\logs.ps1'
exit 1

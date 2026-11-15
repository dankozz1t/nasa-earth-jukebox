# Run the test suites. The backend tests run in Docker when the .NET SDK is missing.
# Usage: .\scripts\test.ps1 [all|frontend|sound|backend]
param([ValidateSet('all', 'frontend', 'sound', 'backend')] [string]$Suite = 'all')
. "$PSScriptRoot/_common.ps1"

function Test-Frontend {
    Push-Location (Join-Path $RootDir 'frontend')
    try {
        if (-not (Test-Path node_modules)) { npm ci --no-fund --no-audit | Out-Host; if ($LASTEXITCODE) { return $false } }
        npm test | Out-Host
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

function Test-Sound {
    Push-Location (Join-Path $RootDir 'sound-service')
    try {
        $py = '.venv\Scripts\python.exe'
        if (-not (Test-Path $py)) {
            python -m venv .venv | Out-Host
            & $py -m pip install -e ".[dev]" | Out-Host
            if ($LASTEXITCODE) { return $false }
        }
        & $py -m pytest -q | Out-Host
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

function Test-Backend {
    Push-Location (Join-Path $RootDir 'backend')
    try {
        if (Get-Command dotnet -ErrorAction SilentlyContinue) {
            dotnet test EarthJukebox.slnx | Out-Host
        } else {
            Assert-Docker
            Write-Host 'No .NET SDK found, running the backend tests in Docker.'
            docker run --rm -v "${PWD}:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet test EarthJukebox.slnx | Out-Host
        }
        return ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }
}

$suites = if ($Suite -eq 'all') { @('frontend', 'sound', 'backend') } else { @($Suite) }
$failed = @()
foreach ($s in $suites) {
    "== $s"
    $ok = switch ($s) {
        'frontend' { Test-Frontend }
        'sound' { Test-Sound }
        'backend' { Test-Backend }
    }
    if (-not $ok) { $failed += $s }
}
if ($failed) { Write-Error "Failed: $($failed -join ', ')"; exit 1 }
'All passed'

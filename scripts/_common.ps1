# Dot-sourced by the other scripts.
$ErrorActionPreference = 'Stop'
$RootDir = Split-Path $PSScriptRoot -Parent

# compose reads .env (at the repository root) on its own; without it the defaults apply.
function Invoke-Compose {
    Push-Location $RootDir
    try {
        & docker compose -f (Join-Path $RootDir 'compose.yaml') @args
        if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed" }
    } finally { Pop-Location }
}

# Prints the calling script's header comment for -h/--help.
function Show-Usage([string]$Script) {
    foreach ($line in Get-Content $Script) {
        if ($line -notmatch '^#') { break }
        $line -replace '^# ?', ''
    }
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Missing: docker. Install Docker Desktop: https://www.docker.com/products/docker-desktop/'
    }
    try { docker info *> $null } catch { }
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running. Start Docker Desktop and try again.' }
}

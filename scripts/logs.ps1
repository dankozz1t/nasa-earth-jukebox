# Follow container logs. Ctrl+C to quit.
# Usage: .\scripts\logs.ps1 [-h|--help] [frontend|backend|sound-service]
. "$PSScriptRoot/_common.ps1"
if ($args -contains '-h' -or $args -contains '--help') { Show-Usage $PSCommandPath; exit 0 }
Assert-Docker
Invoke-Compose logs -f --tail=100 @args

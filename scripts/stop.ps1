# Stop and remove the app containers (images stay, next start is fast).
# Usage: .\scripts\stop.ps1 [-h|--help]
. "$PSScriptRoot/_common.ps1"
if ($args -contains '-h' -or $args -contains '--help') { Show-Usage $PSCommandPath; exit 0 }
Assert-Docker
Invoke-Compose down

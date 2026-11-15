#!/usr/bin/env bash
# Stop and remove the app containers (images stay, next start is fast).
# Usage: scripts/stop.sh [-h|--help]
set -euo pipefail
source "$(dirname "$0")/_common.sh"
case "${1:-}" in -h|--help) usage; exit 0 ;; esac
need_docker
compose down

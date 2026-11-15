#!/usr/bin/env bash
# Follow container logs. Ctrl+C to quit.
# Usage: scripts/logs.sh [-h|--help] [frontend|backend|sound-service]
set -euo pipefail
source "$(dirname "$0")/_common.sh"
case "${1:-}" in -h|--help) usage; exit 0 ;; esac
need_docker
compose logs -f --tail=100 "$@"

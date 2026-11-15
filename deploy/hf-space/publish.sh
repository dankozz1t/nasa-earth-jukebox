#!/usr/bin/env bash
# Upload the app to a Hugging Face Docker Space; the Space builds the Dockerfile.
#   once:  pip install -U huggingface_hub && hf auth login   (a token with write access)
#   run:   deploy/hf-space/publish.sh <owner>/<space>
# Sends frontend/, backend/ and sound-service/ without tests, plus this folder. Uncommitted changes go too.
set -euo pipefail
SPACE="${1:?usage: deploy/hf-space/publish.sh <owner>/<space>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT"
git ls-files -co --exclude-standard -- frontend backend sound-service deploy/hf-space \
  | grep -v -e '/tests/' -e '^deploy/hf-space/publish.sh$' \
  | tar -cf - -T - | tar -xf - -C "$OUT"
cp deploy/hf-space/Dockerfile "$OUT/Dockerfile"
cp deploy/hf-space/SPACE_README.md "$OUT/README.md"

echo "uploading $(find "$OUT" -type f | wc -l) files to spaces/$SPACE"
hf upload "$SPACE" "$OUT" . --repo-type space --delete "*" \
  --commit-message "Deploy $(git rev-parse --short HEAD)"
echo "done: https://huggingface.co/spaces/$SPACE (the build log is on the Space page)"

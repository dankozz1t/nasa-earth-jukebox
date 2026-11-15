#!/usr/bin/env bash
# Build the single-container image with Cloud Build and deploy it to Cloud Run.
#   once:  install the gcloud CLI, then `gcloud auth login`
#   run:   deploy/cloud-run/deploy.sh <project-id> [region]      (from anywhere in the repository)
# Safe to run again: it creates what is missing and deploys a new revision.
# AI key (optional): put it into Secret Manager as `anthropic-api-key` or `openrouter-api-key` first,
# see docs/deployment.md. Without one the rule-based composer plays.
set -euo pipefail
PROJECT="${1:?usage: deploy/cloud-run/deploy.sh <project-id> [region]}"
REGION="${2:-europe-west1}"
SERVICE="${SERVICE:-earth-jukebox}"
REPO=earth-jukebox
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

gc() { gcloud --project "$PROJECT" --quiet "$@"; }

echo "== APIs"
gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com

NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${NUMBER}-compute@developer.gserviceaccount.com"

echo "== permissions for builds (new projects build as the default compute service account)"
gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/cloudbuild.builds.builder --condition None >/dev/null

echo "== image repository"
gc artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
  || gc artifacts repositories create "$REPO" --repository-format docker --location "$REGION"

IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/app:$(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo -dirty)"
echo "== build $IMAGE (5-10 min)"
gc builds submit --region "$REGION" --config deploy/cloud-run/cloudbuild.yaml \
  --ignore-file deploy/cloud-run/gcloudignore --substitutions "_IMAGE=$IMAGE" .

SECRETS=()
for pair in "ANTHROPIC_API_KEY=anthropic-api-key" "OPENROUTER_API_KEY=openrouter-api-key"; do
  name="${pair#*=}"
  if gc secrets describe "$name" >/dev/null 2>&1; then
    gc secrets add-iam-policy-binding "$name" --member "serviceAccount:$RUNTIME_SA" \
      --role roles/secretmanager.secretAccessor >/dev/null
    SECRETS+=("$pair:latest")
  fi
done
SECRET_ARGS=(--clear-secrets)
if ((${#SECRETS[@]})); then
  SECRET_ARGS=(--set-secrets "$(IFS=,; echo "${SECRETS[*]}")")
  echo "== AI key from Secret Manager: ${SECRETS[*]%%=*}"
else
  echo "== no AI key in Secret Manager: the rule-based composer plays"
fi

echo "== deploy $SERVICE to $REGION"
# max-instances 1: the AI quotas and caches live in memory, and it caps the cost.
gc run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --port 8080 \
  --cpu 1 --memory 1Gi --cpu-boost --min-instances 0 --max-instances 1 --concurrency 40 --timeout 300 \
  --allow-unauthenticated "${SECRET_ARGS[@]}" \
  --set-env-vars "ES_AI_DAILY_LIMIT=${ES_AI_DAILY_LIMIT:-100},AI_PER_VISITOR_HOUR=${AI_PER_VISITOR_HOUR:-10}"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"

# Cloud Run stops an idle instance after about 15 minutes. A health check every 10 minutes keeps
# it warm, so visitors skip the cold start. Billing is per request, so the pings cost next to nothing;
# Cloud Scheduler gives 3 jobs per billing account for free.
echo "== keep-warm ping every 10 minutes"
JOB="$SERVICE-warmup"
JOB_ARGS=(--location "$REGION" --schedule "*/10 * * * *" --http-method GET
  --uri "$URL/api/health" --attempt-deadline 60s)
if gc scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1; then
  gc scheduler jobs update http "$JOB" "${JOB_ARGS[@]}" >/dev/null
else
  gc scheduler jobs create http "$JOB" "${JOB_ARGS[@]}" >/dev/null
fi

echo "done: $URL"

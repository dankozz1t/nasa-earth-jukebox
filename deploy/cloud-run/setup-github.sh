#!/usr/bin/env bash
# One-time setup, run by a project owner: lets GitHub Actions in one repository deploy to Cloud Run
# without a stored key (Workload Identity Federation).
#   run:  deploy/cloud-run/setup-github.sh <project-id> [owner/repo]
# Creates the pool and provider `github`, and the service account `github-deployer` with only the
# roles deploy.sh needs. Only workflows of that repository can sign in as it. Safe to run again.
set -euo pipefail
PROJECT="${1:?usage: deploy/cloud-run/setup-github.sh <project-id> [owner/repo]}"
GH_REPO="${2:-dankozz1t/nasa-earth-jukebox}"
POOL=github
PROVIDER=github
SA_NAME=github-deployer

gc() { gcloud --project "$PROJECT" --quiet "$@"; }

NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
RUNTIME_SA="${NUMBER}-compute@developer.gserviceaccount.com"

echo "== APIs"
gc services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

echo "== workload identity pool and provider for $GH_REPO"
gc iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 \
  || gc iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
gc iam workload-identity-pools providers describe "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" >/dev/null 2>&1 \
  || gc iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --display-name "GitHub" \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '$GH_REPO'"

echo "== service account $SA"
gc iam service-accounts describe "$SA" >/dev/null 2>&1 \
  || gc iam service-accounts create "$SA_NAME" --display-name "GitHub Actions deployer"

# run.admin: deploy and keep the service public; cloudbuild + storage: submit builds and upload the source;
# viewer: read build logs and secret names; serviceUsageConsumer: call the APIs of this project.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin roles/viewer \
  roles/serviceusage.serviceUsageConsumer; do
  gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" \
    --condition None >/dev/null
done
# builds and the service run as the default compute account
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$SA" \
  --role roles/iam.serviceAccountUser >/dev/null

echo "== only $GH_REPO may sign in as $SA"
gc iam service-accounts add-iam-policy-binding "$SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GH_REPO" \
  >/dev/null

echo "done. In .github/workflows/ci-cd.yml:"
echo "  workload_identity_provider: projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  service_account: $SA"

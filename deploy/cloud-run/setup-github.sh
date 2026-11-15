#!/usr/bin/env bash
# One-time setup, run by a project owner: lets GitHub Actions in one repository deploy to Cloud Run
# without a stored key (Workload Identity Federation).
#   run:  deploy/cloud-run/setup-github.sh <project-id> [owner/repo]
# Creates the pool and provider `github`, and the service account `github-deployer` with only the
# roles deploy.sh needs. Trust goes to the repository ID, not its name: the ID survives a transfer or
# a rename, and a new repository that takes the old name gets a different one. Safe to run again.
set -euo pipefail
PROJECT="${1:?usage: deploy/cloud-run/setup-github.sh <project-id> [owner/repo]}"
GH_REPO="${2:-divine-rapier-dev/nasa-earth-jukebox}"
POOL=github
PROVIDER=github
SA_NAME=github-deployer

gc() { gcloud --project "$PROJECT" --quiet "$@"; }

# The public API answers for public repositories; gh also works for private ones.
if command -v gh >/dev/null 2>&1; then
  REPO_ID="$(gh api "repos/$GH_REPO" --jq .id)"
else
  REPO_ID="$(curl -fsS "https://api.github.com/repos/$GH_REPO" | sed -n 's/^  "id": \([0-9]*\),$/\1/p')"
fi
[[ "$REPO_ID" =~ ^[0-9]+$ ]] || { echo "could not read the ID of $GH_REPO" >&2; exit 1; }

NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
RUNTIME_SA="${NUMBER}-compute@developer.gserviceaccount.com"

echo "== APIs"
# cloudresourcemanager: the deployer reads the project number; an owner's gcloud may bill such calls
# to another project, so it can be off here without anyone noticing.
gc services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com

echo "== workload identity pool and provider for $GH_REPO (ID $REPO_ID)"
MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref"
CONDITION="assertion.repository_id == '$REPO_ID'"
gc iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 \
  || gc iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
if gc iam workload-identity-pools providers describe "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  gc iam workload-identity-pools providers update-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION" >/dev/null
else
  gc iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --display-name "GitHub" \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION"
fi

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

echo "== only repository $REPO_ID may sign in as $SA"
gc iam service-accounts add-iam-policy-binding "$SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID" \
  >/dev/null

echo "done. In .github/workflows/ci-cd.yml:"
echo "  workload_identity_provider: projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  service_account: $SA"

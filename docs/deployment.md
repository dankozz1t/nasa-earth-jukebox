# Deployment: Google Cloud Run

The public app runs on [Google Cloud Run](https://cloud.google.com/run) as **one container**. Cloud Run starts it on demand and scales it to zero when nobody visits; one container starts once instead of three services in turn.

```
visitor -> Cloud Run -> nginx :8080 -+- frontend (static files)
                                     +- /api -> backend 127.0.0.1:5080 -> sound-service 127.0.0.1:8000
```

| File | What it does |
|---|---|
| `deploy/container/Dockerfile` | Builds the three parts and puts them into one Python image with the ASP.NET runtime and nginx |
| `deploy/container/nginx.conf` | Port 8080, runs as uid 1000, temp files in `/tmp`, visitor address from `X-Forwarded-For` |
| `deploy/container/start.sh` | Starts the three processes; if one exits, the container stops and Cloud Run starts a new one |
| `deploy/cloud-run/deploy.sh` | Turns on the APIs, builds the image with Cloud Build, deploys the service |
| `deploy/cloud-run/cloudbuild.yaml` | The Cloud Build step |
| `deploy/cloud-run/gcloudignore` | What is not uploaded to Cloud Build: `.env`, `.git`, docs, build output |

nginx takes the visitor address from `X-Forwarded-For`, so the per-visitor AI quota and the compose rate limit work behind the Cloud Run proxy.

## Cost

A hackathon demo stays inside the Cloud Run monthly free tier: 2 million requests, 180,000 vCPU-seconds and 360,000 GiB-seconds. Outbound traffic past the free allowance costs cents; a listening session downloads about 20–40 MB of audio. Google asks for a billing account, so set a budget alert (step 2 below).

`deploy.sh` deploys with 2 vCPU, 4 GiB, at most one instance and no idle instance. Cloud Run bills only while requests are being handled, so the free tier covers about 25 hours of active rendering a month at this size.

Every cached soundscape keeps its audio in memory, and a 2-minute weather piece takes about 130 MB. So the container:
- renders at most two soundscapes at a time (`ES_MAX_PARALLEL_RENDERS`, default 2) and queues the rest;
- keeps caches sized for 4 GiB (`ES_CACHE_SIZE=12`, `ES_WEATHER_CACHE_SIZE=8`);
- sets `MALLOC_ARENA_MAX=2` so freed memory goes back to the system.

The service takes up to 200 requests at once (`--concurrency 200`). Queued renders hold their connections while stems download beside them, and at 40 Cloud Run turned visitors away with 429.

A load test of 27 different compose requests at once answered every request, and memory peaked at 2.7 GiB with full caches. With 1 GiB a smaller burst crashed the instance (out of memory). When the server has dropped a piece from its cache, the player composes it again by itself. The first visit after a quiet period waits a few seconds for the cold start.

## First time

1. Sign in to the [Google Cloud console](https://console.cloud.google.com/) and create a project, for example `earth-jukebox`. Note its **project ID**.
2. **Billing**: link a billing account to the project. Then open **Billing → Budgets & alerts** and create a budget of, say, 5 USD with e-mail alerts.
3. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and sign in:
   ```bash
   gcloud auth login
   ```
4. Optional, to turn the AI composer on: store your key in Secret Manager. Type the key at the prompt; it never lands in a file or in the shell history:
   ```bash
   gcloud services enable secretmanager.googleapis.com --project <project-id>
   read -rsp 'Anthropic key: ' k && printf '%s' "$k" | gcloud secrets create anthropic-api-key --data-file=- --project <project-id>; unset k
   ```
   For OpenRouter use the secret name `openrouter-api-key`. Set a spend cap on the key at the provider too. Without a key the rule-based composer plays.

## Deploy

From the repository root, in a bash shell (Git Bash on Windows):

```bash
deploy/cloud-run/deploy.sh <project-id>
```

The script:
- turns on the APIs it needs;
- creates an image repository in Artifact Registry;
- builds the image with Cloud Build (5–10 min the first time);
- deploys the `earth-jukebox` service in `europe-west1`;
- creates a Cloud Scheduler job, `earth-jukebox-warmup`, that opens `/api/health` every 10 minutes. Cloud Run stops an idle instance after about 15 minutes, so the ping keeps it warm and visitors skip the cold start. Billing is per request, so the pings cost next to nothing, and Cloud Scheduler gives 3 jobs per billing account for free. Pause or delete the job in **Cloud Scheduler** in the console.

It prints the public URL, `https://earth-jukebox-….run.app`. Run the same command again to deploy a new version. It deploys the working tree, uncommitted changes included, and tags the image `-dirty` when there are any. Another region goes second: `deploy/cloud-run/deploy.sh <project-id> us-central1`.

The spend guards are environment variables of the service: `ES_AI_DAILY_LIMIT` (default 100 AI calls per UTC day) and `AI_PER_VISITOR_HOUR` (default 10). Set them before the command to change them, e.g. `ES_AI_DAILY_LIMIT=30 deploy/cloud-run/deploy.sh <project-id>`. A new key or a rotated one in Secret Manager takes effect on the next deploy.

Logs: **Cloud Run → earth-jukebox → Logs** in the console, or:

```bash
gcloud run services logs read earth-jukebox --region europe-west1 --project <project-id>
```

## Run the container locally

```bash
docker build -f deploy/container/Dockerfile -t earth-jukebox .
docker run --rm -p 8090:8080 earth-jukebox
```

Open <http://localhost:8090>. Add `--env-file .env` to try it with your AI key.

## Good to know

- Keys live only in Secret Manager, never in the repository or the image.
- After a start the live weather loads in the background. The bundled snapshot plays for the first minutes, and the UI says so.
- Cloud Run does not promise to keep an instance even with the ping. For a guaranteed warm instance during a demo, deploy with `--min-instances 1` and set it back to 0 afterwards; an idle instance is billed every hour it runs.

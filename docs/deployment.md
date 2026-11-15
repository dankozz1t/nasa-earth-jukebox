# Deployment: Hugging Face Spaces

The free Hugging Face Space tier (CPU basic: 2 vCPU, 16 GB RAM) runs the whole app in **one container**. Free hosts put idle apps to sleep, and three separate services would each wake up in turn, so the Space runs them together:

```
visitor -> nginx :7860 -+- frontend (static files)
                        +- /api -> backend 127.0.0.1:8080 -> sound-service 127.0.0.1:8000
```

| File in `deploy/hf-space/` | What it does |
|---|---|
| `Dockerfile` | Builds the three parts and puts them into one Python image with the ASP.NET runtime and nginx |
| `nginx.conf` | Port 7860, runs as uid 1000, temp files in `/tmp`, visitor address from `X-Forwarded-For` |
| `start.sh` | Starts the three processes; if one exits, the container stops and the Space restarts it |
| `SPACE_README.md` | The Space card; it becomes `README.md` in the Space |
| `publish.sh` | Uploads the app without tests to the Space with `hf upload` |

## First time

1. Sign up at [huggingface.co](https://huggingface.co).
2. **New → Space**: SDK **Docker**, template **Blank**, hardware **CPU basic (free)**, visibility **Public**.
3. **Settings → Access Tokens → New token** with **Write** access. Install the CLI and log in; type the token into the prompt, never into a file:
   ```bash
   pip install -U huggingface_hub
   hf auth login
   ```
4. In the Space, **Settings → Variables and secrets** (all optional):
   - Secret `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` turns the AI composer on. Set a spend cap on the key at the provider.
   - Variables `ES_AI_DAILY_LIMIT` (default 100 AI calls per UTC day) and `AI_PER_VISITOR_HOUR` (default 10): the same spend guards as in [.env.example](../.env.example).

## Publish

From the repository root, on the branch to deploy:

```bash
deploy/hf-space/publish.sh <owner>/<space>
```

The Space builds the image in about 5–8 minutes; the build log is on the Space page. The app then opens at `https://<owner>-<space>.hf.space`.

## Test the image locally

```bash
docker build -f deploy/hf-space/Dockerfile -t earth-jukebox-space .
docker run --rm -p 7860:7860 --env-file .env earth-jukebox-space
```

Open <http://localhost:7860>. `.env` is only needed for AI keys; without `--env-file` the rule-based composer plays.

## Good to know

- A public Space shows its files, which are the same as in this public repository. Keys live only in the Space secrets.
- After a start the live weather loads in the background. The bundled snapshot plays for the first minutes and the UI says so.
- A free Space sleeps after about 48 hours without visitors. Open it a few minutes before a demo.

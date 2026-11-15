# syntax=docker/dockerfile:1
# Earth Jukebox as one container for Google Cloud Run (deploy/cloud-run/deploy.sh).
# nginx :8080 serves the frontend and proxies /api to the backend (127.0.0.1:5080),
# which calls the sound service (127.0.0.1:8000). One container starts once after scaling to zero.
# Build from the repository root:  docker build -f deploy/container/Dockerfile -t earth-jukebox .

FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/src/EarthJukebox.Api/EarthJukebox.Api.csproj src/EarthJukebox.Api/
RUN dotnet restore src/EarthJukebox.Api/EarthJukebox.Api.csproj
COPY backend/src ./src
RUN dotnet publish src/EarthJukebox.Api/EarthJukebox.Api.csproj -c Release -o /out --no-restore

FROM python:3.13-slim-bookworm AS sound
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN python -m venv /app/.venv
COPY sound-service/pyproject.toml ./
COPY sound-service/src ./src
RUN /app/.venv/bin/pip install . \
 && find /app/.venv -name "__pycache__" -type d -prune -exec rm -rf {} + \
 && /app/.venv/bin/python -m compileall -q /app/.venv

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS dotnet

FROM python:3.13-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx ca-certificates libicu72 tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=dotnet /usr/share/dotnet /usr/share/dotnet
RUN ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
 && useradd -m -u 1000 user
COPY --from=sound /app/.venv /app/sound/.venv
COPY --from=backend /out /app/backend
COPY --from=frontend /src/dist /app/www
COPY deploy/container/nginx.conf /app/nginx.conf
COPY --chmod=755 deploy/container/start.sh /app/start.sh

# MALLOC_ARENA_MAX: NumPy renders run in threads; fewer malloc arenas give freed memory back.
# Caches sized for 4 GiB: every cached soundscape keeps its stems in memory (a 2-minute weather piece
# is ~130 MB). 27 different requests at once peaked at 2.7 GiB with full caches.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MALLOC_ARENA_MAX=2 \
    ES_HOST=127.0.0.1 ES_PORT=8000 ES_CACHE_SIZE=12 ES_WEATHER_CACHE_SIZE=8 \
    ASPNETCORE_URLS=http://127.0.0.1:5080 ASPNETCORE_ENVIRONMENT=Production DOTNET_gcServer=0 \
    SoundService__BaseUrl=http://127.0.0.1:8000/
# run as a non-root user
USER 1000
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]

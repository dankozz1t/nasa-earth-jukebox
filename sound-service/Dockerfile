# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN python -m venv /app/.venv
COPY pyproject.toml ./
COPY src ./src
RUN /app/.venv/bin/pip install . \
 && find /app/.venv -name "__pycache__" -type d -prune -exec rm -rf {} + \
 && /app/.venv/bin/python -m compileall -q /app/.venv

FROM python:3.13-slim-bookworm AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    ES_HOST=0.0.0.0 \
    ES_PORT=8000
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["python", "-m", "earth_sound", "serve"]

# AGENTS.md

Guide for coding agents (Claude Code, Codex, Cursor and others) working on Earth Jukebox. [CLAUDE.md](CLAUDE.md) only imports this file, so all rules live here.

## What this is

A web app that turns NASA Earth imagery and live weather into music, built for blind and low-vision listeners first. Product overview: [README.md](README.md). Architecture and request flow: [docs/architecture.md](docs/architecture.md).

## Where things are

| Need | Read |
|---|---|
| Folder layout | [docs/development.md#layout](docs/development.md#layout) |
| Public API | [docs/api.md](docs/api.md) |
| How data becomes sound | [docs/sound-mapping.md](docs/sound-mapping.md) |
| Data sources and licenses | [docs/data-sources.md](docs/data-sources.md) |
| Accessibility features | [docs/accessibility.md](docs/accessibility.md) |
| AI composer, keys, spend limits | [docs/ai.md](docs/ai.md) |
| Per-service details | [frontend](frontend/README.md), [backend](backend/README.md), [sound-service](sound-service/README.md) |

## Start, stop, test

- Bring the app up and check it works: follow [.claude/skills/start-app/SKILL.md](.claude/skills/start-app/SKILL.md). Claude Code loads it as the `start-app` skill. Other agents read the file directly.
- Scripts, fast frontend loop and running services by hand: [docs/development.md](docs/development.md).
- Tests and linters for each service: [docs/development.md#tests](docs/development.md#tests), or `scripts/test.sh [frontend|sound|backend]` for all of them.

Before handing work back, run the tests and linters of every service you touched.

## Rules

- Conventions (i18n, dependency direction, layers, comments, language): [docs/development.md#conventions](docs/development.md#conventions).
- **Keys.** The repository never holds a key. Each developer puts their own `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` in `.env` at the repository root, which git ignores. Never print, log, commit or paste a key anywhere.
- **Paid calls.** Don't call the AI composer (`composer: "ai"` or `"auto"` with a key set) from tests or smoke checks. The test suites use fakes.
- **Git.** No commits or pushes unless the person asked for them. Don't rewrite history.
- **Data credit.** NASA and Open-Meteo data stay credited in the UI and docs. Open-Meteo is CC BY 4.0 and needs visible attribution.

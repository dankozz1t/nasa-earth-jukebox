# AI

Two separate things: an optional AI composer inside the app, and the AI tools the team used while building it.

## The AI composer (optional)

**What it does.** For the live weather side, a large language model can write the score. The sound service sends it the data we computed for every bar (mean, min, max and level of the weather under the wave, the section's key and tempo) and asks for a score in a strict JSON schema: chords, melody in scale degrees, arpeggio density, pads, rhythm, accents. The service then checks and repairs that score (bar count, chords in key, notes on the grid, loudness limits) and plays it with its own synthesizer.

**What it does not do.** It does not generate audio, does not see the map image and does not touch the NASA aerosol side. Loudness always follows the data, whatever the model writes, so a bad answer cannot make the sound unsafe. When the score had to be repaired, the response carries a warning ("AI score was repaired").

**When it runs.** Only when a key is set and the user picks it: the "AI composes" preset, or composer AI or Auto in Sound settings. All other presets use the rule-based composer, which is instant and deterministic.

**Keys.** Set one of these in `.env` at the repository root (copy from [.env.example](../.env.example)):

| Variable | Default model |
|---|---|
| `OPENROUTER_API_KEY` | `anthropic/claude-haiku-5.5` |
| `ANTHROPIC_API_KEY` | `claude-opus-5-5` |

With both set, `ES_AI_PROVIDER=auto` uses Anthropic. `ES_AI_MODEL` overrides the model, `ES_AI_EFFORT` (`low` by default) sets the reasoning effort. The service log says at start whether AI is on (`AI composer on: ...`).

**Your own key.** The repository ships no key. Every developer or host sets their own in `.env`, which git ignores. Set a spend cap on the key at the provider.

**Running the sound service by hand.** Outside Docker the service reads keys from `sound-service/.env` and from your shell. Besides the two keys, Anthropic credentials in your shell environment or home folder also turn AI on: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_PROFILE`, `ANTHROPIC_FEDERATION_RULE_ID`, or a saved profile in `~/.config/anthropic` (from `ant auth login`). Calls are then billed to that account. Set `ES_AI_ENABLED=false` to keep AI off. Inside Docker only the variables listed in `compose.yaml` reach the service.

**Cost and limits.** Each AI composition is a paid API call and takes from a few seconds up to about a minute. Results are cached in memory: the same weather reading and settings return the stored score without a new call. Two guards keep the bill small:

| Guard | Default | Variable |
|---|---|---|
| Paid AI calls per UTC day, whole server (sound service) | 100 | `ES_AI_DAILY_LIMIT` |
| AI compositions per visitor per hour (backend) | 10 | `AI_PER_VISITOR_HOUR` in `.env` (`RateLimit:AiComposePerHour`) |

Past either limit the request is not refused: the rule-based composer plays and the response carries a warning.

**Fallback.** No key, a refusal, a timeout or an invalid answer: the rule-based composer plays the same score format, and the response explains why. The app is fully usable without any key.

**Why a score and not audio.** A JSON score can be checked, repaired and explained, the sound stays stable and safe for hearing, and the rule-based fallback keeps the app free to run.

Code: [sound-service/src/earth_sound/adapters/outbound/ai/](../sound-service/src/earth_sound/adapters/outbound/ai/).

## AI tools used to build the project

- **Claude Code** (Anthropic; models Claude Opus 5.5 and Claude Sonnet 5.5) was used throughout: writing and refactoring code in all three services, tests and documentation.
- The team set the goals, the sound design and the musical rules, made the architecture decisions, reviewed the changes, and tested the app by ear and by hand.
- The project logo was generated with an OpenAI image model and picked by the team.
- [AGENTS.md](../AGENTS.md) is the shared guide for coding assistants working on the code. [CLAUDE.md](../CLAUDE.md) imports AGENTS.md for Claude Code.

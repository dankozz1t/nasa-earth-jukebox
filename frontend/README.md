# frontend

React 19 + Vite + TypeScript (`strict`). The [sound-service](../sound-service/) makes the sound; the frontend plays its stems with Web Audio.

## Stack

| What | Choice |
|---|---|
| UI, build | React 19, Vite 6, TypeScript |
| Server state | TanStack Query (cache, refetch at `nextUpdateAt`) |
| Client state | Zustand (preferences persisted in `localStorage`; session: preset, source, mix) |
| Routing | React Router 7 (`/`, `/how`, `/team`, 404) |
| Styles | CSS Modules + tokens in `src/shared/styles/tokens.css` |
| i18n | Own `useT()` over the dictionary in `src/shared/i18n/i18n.ts` (English, Ukrainian) |
| Tests | Vitest, Testing Library, axe-core (jsdom) |

Not used on purpose: Next.js, Tailwind, UI kits, Tone.js, i18next. Every UI string goes through `t()` (checked by the `no-literals` test).

## `src/` layout

Dependencies go one way: **shared → features → app**. Features reach each other only through their `index.ts`. Pure logic has no React.

| Folder | What |
|---|---|
| `shared/` | `api` (`/api` client, TanStack queries), `i18n`, `ui` (Button, Switch, Drawer, Menu…), `styles` (tokens, fonts), `lib` (formatting, `useHotkeys`) |
| `audio/` | `stem-player.ts` (`StemPlayer`), `usePlayer`, `narrator`, `probe-voice` |
| `features/` | `presets` (shelf, session), `stage` (map, explorer), `live` (readings panel), `aerosols`, `transport`, `tune`, `save`, `access` (preferences), `help` (keys) |
| `pages/how/` | "How it works" page in three views: Simple, For scientists (lazy) and For engineers (lazy, diagrams) |
| `pages/team/` | Team page (lazy) |
| `app/` | Router, providers, header, error boundary |
| `assets/` | Team logo |
| `main.tsx` | Entry point |

## Shelf

Two rows, one shown at a time: **Side A · NASA archive** (shown first) and **Side B · Live**. Each row starts with **Create your mix**: it selects that row's own mix (the last one made for that source, else a copy of the record selected in the row, else its first record), plays it and opens Sound settings. Once a source has a mix, the record is called **Your mix**.

| Row | Presets |
|---|---|
| NASA archive | `nasa-four` Four aerosols (default on a first visit), `nasa-scale` Gentle scale, `nasa-quick` Quick tour |
| Live | `live-rain` Rain right now, `live-heat` Heat and cold, `live-wind` Wind map, `live-clouds` Clouds, `live-ai` AI composes |

Raw mode, the drone switch, the aerosol composer and the four layer tour (repeat all) are in Sound settings. A remembered or shared (`?p=`) id that no longer exists falls back to the default.

## Audio engine

`src/audio/stem-player.ts` (`StemPlayer`: two decks, crossfade, repeat, mute, seek, spot) is kept apart from React through `usePlayer` (`useSyncExternalStore`). New behaviour (live updates, tour, mix) is built around it in `features/*`. The `AudioContext` is created only in a click or key handler.

## Commands

```bash
npm ci
npm run dev      # http://localhost:5173, /api -> http://localhost:8080 (change with API_URL)
npm test         # Vitest, including axe-core (WCAG 2.2 A/AA, both languages)
npm run lint     # ESLint (TypeScript, React hooks, jsx-a11y)
npm run format:check
npm run build    # tsc --noEmit + vite build -> dist/ (served by nginx in Docker, see nginx.conf)
```

Budget: main bundle at most 180 KB gzip without fonts (check the `index-*.js` gzip size `npm run build` prints); `/how`, its views for scientists and engineers, `/team` and the Sound settings drawer load lazily.

Accessibility features: [docs/accessibility.md](../docs/accessibility.md).

On Windows with Smart App Control, Rollup is replaced by its WASM build in `package.json` (`overrides`), because the native module is blocked.

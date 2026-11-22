# Sabotetris — Agent Guide

A chaotic Tetris clone built with **Excalibur.js** v0.29, **React** 19, and **Vite**, with optional global leaderboards on **PostgreSQL via Supabase**.
For the game rules, effects and controls see [README.md](README.md).

## Tech Stack

- **Language** — TypeScript
- **Runtime** — [Excalibur.js](https://excaliburjs.com) v0.29
- **UI shell** — React 19 + Vite
- **Database** — PostgreSQL, hosted on Supabase
- **Backend** — Supabase Edge Functions (Deno/TypeScript), anonymous Auth, SQL RPCs
- **Abuse protection** — Cloudflare Turnstile, server-side input validation, PostgreSQL-backed rate limits
- **Offline persistence** — localStorage
- **Audio** — procedural 8-bit chiptune via Web Audio API (no binary assets)
- **Hosting and CI** — GitHub Pages + GitHub Actions

## Quick Start

Use **Node.js 24** (see `.nvmrc`) and npm.

```bash
npm ci
npm run dev      # Vite dev server, normally http://localhost:5173/sabotetris/
```

Without online configuration the game runs locally and never contacts Supabase or loads Turnstile.

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` (`predev` runs `scripts/version.mjs`) | Dev server |
| `build` | `tsc -b && vite build` (`prebuild` runs `scripts/version.mjs`) | Production build |
| `lint` | `eslint .` | Lint check |
| `test` | `node --test --experimental-strip-types tests/*.test.ts` | Node.js regression, ranking and HTTP-handler tests |
| `test:db` | `bash scripts/test-db.sh` | Isolated PostgreSQL tests; requires Docker |
| `check:edge` | `npx --yes deno@2.9.6 check ...` | Deno type check of Edge Functions; first run needs network |
| `version:gen` | `node scripts/version.mjs` | Stand-alone version generation |
| `preview` | `vite preview` | Preview production build |

Run `npm test`, `npm run lint` and `npm run build` before committing. Run `npm run test:db` and `npm run check:edge` when touching `supabase/`.

## Project Structure

```text
src/
├── engine/
│   ├── actors/       # BoardActor, SidePanel
│   ├── scenes/       # MainMenu, Game, GameOver, Ranking
│   ├── services/     # Gameplay, audio, local and remote rankings
│   └── Game.ts       # Engine bootstrap and scene registration
├── data/             # levels.ts (maxScore, bg colour, speed), tetrominoes.ts
├── types/            # Shared types and constants (src/types/index.ts)
├── ui/               # React entry point (App.tsx) and index.css
└── utils/            # Grid helpers, rotation, random, pointer activation
supabase/
├── functions/        # start-run, submit-score, leaderboard, shared HTTP/auth handlers
├── migrations/       # PostgreSQL schema, indexes, permissions, SQL functions
└── schedule.sql      # Daily cleanup via pg_cron
scripts/              # version.mjs, test-db.sh (isolated database test runner)
tests/                # Node.js tests and PostgreSQL integration assertions
docs/                 # supabase-setup.md (Spanish), demo video (MP4 + GIF)
video/                # Remotion project that renders the demo video (standalone, own lockfile)
vite.config.ts        # Vite config, base path, version plugin
```

## Build System

### Version generation

`scripts/version.mjs` (and a `sabotetris-version` plugin in `vite.config.ts`) generates `src/generated/version.ts` from git state:

- `APP_VERSION` — `{base}-{shortHash}`, with a `-dirty` suffix for uncommitted changes (base is hardcoded in the script, currently `2.0`)
- `APP_BRANCH` — current branch name

The file is git-ignored and regenerated on every `dev`/`build`. The version shown on the main menu comes from it.

### TypeScript

TypeScript ~6.0.2 with project references: `tsconfig.json` (root), `tsconfig.app.json` (app source), `tsconfig.node.json` (Vite config / scripts). Strict settings (`noUnusedLocals`, `noUnusedParameters`, …) are enforced.

### Vite

- `base: '/sabotetris/'` — hardcoded subpath for GitHub Pages
- React plugin enabled

## Architecture

### Layer split

1. **React shell** (`src/ui/`, `src/main.tsx`) — mounts a single `<div>` and instantiates the Excalibur engine. No React UI logic inside the game.
2. **Excalibur engine** (`src/engine/`) — owns the canvas, scenes, actors and game loop. All rendering happens here.
3. **Data & utils** (`src/data/`, `src/utils/`, `src/types/`) — pure TypeScript with no framework dependencies.

### Game engine

`src/engine/Game.ts` bootstraps `ex.Engine` with:

- `DisplayMode.Fixed` on desktop
- `DisplayMode.FitScreenAndFill` on mobile (detected at load time via `MobileService.isMobile`)
- `antialiasing: false` for pixel-art look
- `suppressPlayButton: true`

### Scenes

| Scene | File | Notes |
|-------|------|-------|
| Menu | `MainMenuScene.ts` | Logo + PLAY / RANKING buttons. Admin mode unlock via `L` key ×5 taps. |
| Game | `GameScene.ts` | Core gameplay (large file). |
| Game Over | `GameOverScene.ts` | Score display, name entry, local save, global publish and retry. |
| Ranking | `RankingScene.ts` | High-score tables. |

### Actors

- `BoardActor` — renders the 10×20 grid, placed cells, current piece, ghost piece and grid lines.
- `SidePanel` — renders next-piece preview, score, level, lines, target score and active chaos effect.

Both use `ex.Canvas` with `cache: false` for dynamic redraw every frame.

### Services (`src/engine/services/`)

| Service | File | Role |
|---------|------|------|
| AudioService | `AudioService.ts` | Web Audio API procedural 8-bit audio. Music + SFX. No binary assets. |
| ChaosEngine | `ChaosEngine.ts` | Applies random chaos effects per level. |
| LevelService | `LevelService.ts` | Level progression, target scores, background colours. |
| MobileService | `MobileService.ts` | Touch detection (`isMobile`) + `TouchInput` class. |
| TouchGestureState | `TouchGestureState.ts` | Gesture recognition state. |
| RankingService | `RankingService.ts` | localStorage-backed top 20 per mode. |
| RemoteRankingService | `RemoteRankingService.ts` | Supabase client: anonymous session, start-run, submit-score, leaderboard reads. |
| OnlineRanking | `OnlineRanking.ts` | Online configuration and availability. |
| ScoreService | `ScoreService.ts` | Score / lines counters. |
| AdminService | `AdminService.ts` | Debug mode for level jumping (bracket keys + digits). Games using debug points are excluded from the official online leaderboard. |

## Chaos Engine

- Effects live in the `CHAOS_EFFECTS` array.
- Only the first `N` effects are unlocked, where `N = 2 + level` (max 12).
- Effects receive a `GameState` interface with callbacks for piece movement, rotation, input locking, phantom blocks, etc.
- The player-facing effect table is in the README; keep it in sync when adding or changing effects.

## Online Rankings: PostgreSQL and Supabase

Supabase provides the PostgreSQL database, anonymous auth, API and Edge Function hosting. It is not a separate database engine.

### Environment (public, build-time)

Create `.env.local` from `.env.example` (git-ignored):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
```

All three are required; restart the dev server after changing them. **Never** put database passwords, Supabase secret/service-role keys or the Turnstile secret in frontend variables.

The backend also needs the SQL migrations, anonymous Auth with Turnstile, the Edge Functions, backend secrets and the cleanup schedule. The full procedure, Free-plan limits, backups and manual acceptance checklist are in [docs/supabase-setup.md](docs/supabase-setup.md) (Spanish).

### Flow

1. Before an online game, the client reuses or creates an anonymous session and calls **start-run** to obtain a run valid for 24 hours.
2. At Game Over, **submit-score** validates the authenticated guest, run ownership, mode, name, score and level. Matching retries return the same receipt instead of inserting duplicates.
3. SQL functions atomically insert and trim scores to the top 20 per mode, with a matching ordering index and PostgreSQL-backed rate limits shared across function instances.
4. The client reads at most 20 rows through **get_leaderboard**, cached for 60 seconds per mode.

### Security model

- Tables live in the unexposed `private` schema with Row Level Security enabled.
- Browser roles can execute the bounded read RPC, but cannot directly write scores or execute the write RPCs.
- Edge Functions verify the caller and use a server-only credential for writes.
- Scheduled cleanup (`supabase/schedule.sql`, pg_cron) removes expired run data and inactive guests without deleting public scores.
- Scores are computed in the browser; validation and rate limits reduce abuse but do not make scoring verified.
- Local history is never uploaded automatically. Online publication requires a run prepared before gameplay.

## Testing

- `npm test` — Node.js test runner over `tests/*.test.ts` (regressions, online ranking, replay security, pointer activation, DB startup).
- `npm run test:db` — isolated PostgreSQL tests in Docker covering permissions, input validation, expiry, retention, idempotency and concurrent submissions. They use a minimal Auth-table fixture, so live Supabase Auth, CAPTCHA, gateway/CORS, Cron and backup recovery still need the manual checks in `docs/supabase-setup.md`.
- `npm run check:edge` — Deno type check of the Edge Functions.

Never weaken a test to make it pass.

## Linting

ESLint config (`eslint.config.js`): `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs.flat.recommended`, `reactRefresh.configs.vite`. Global ignores: `dist`.

## Deployment

- GitHub Actions (`.github/workflows/deploy.yml`) runs the checks on pull requests targeting `master`; pushes to `master` also deploy the frontend to GitHub Pages.
- The three public `VITE_...` values must be configured separately under **Settings → Secrets and variables → Actions → Variables**. The workflow reads repository variables, not Secrets. Changes require a new build.
- SQL migrations, cleanup scheduling and Edge Function deployment are separate from the Pages workflow. Backend-only secrets stay in Supabase and are never included in the frontend bundle.

## Key Coding Conventions

1. **Excalibur imports** — `import * as ex from 'excalibur'` everywhere.
2. **Scene/actor methods** — `onInitialize`, `onActivate`, `onDeactivate`, `onPreUpdate` follow the Excalibur lifecycle.
3. **Canvas rendering** — Actors use `ex.Canvas({ draw: (ctx) => ... })` with `cache: false` when content changes every frame.
4. **Constants** — Board geometry, colours and layout constants live in `src/types/index.ts` (e.g. `CANVAS_WIDTH`, `BOARD_X`, `CELL_SIZE`).
5. **No external audio** — All sound is generated via `AudioService` using `OscillatorNode` and `GainNode`. Do not add binary audio files.
6. **Mobile is conditional** — `isMobile` is evaluated at module load. Touch listeners only register when `isMobile === true`.

## Mobile-Specific Rules

- `MobileService.ts` detects mobile via `navigator.maxTouchPoints` **and** `matchMedia('(pointer: coarse)')`.
- `TouchInput` attaches `pointerdown`/`pointermove`/`pointerup` to the canvas.
- Uses `engine.screenToWorldCoordinates()` to map touch points to world coordinates when the canvas is scaled (FitScreenAndFill mode).
- Gesture thresholds: `SWIPE_THRESHOLD = 32` px, `TAP_MAX_MOVE = 10` px, `TAP_MAX_DURATION_MS = 300`, `DOUBLE_TAP_MS = 300`.
- Swipe up → rotate. Swipe down → soft drop. Double tap → hard drop.
- Pause is triggered by the **phone back button** (`popstate` listener), not a touch gesture.

## CSS Rules

- `src/ui/index.css` sets `#game-container` to `100%` width/height with `overflow: hidden`.
- The canvas has `image-rendering: pixelated` and `touch-action: none`.
- Desktop-only `max-width: 600px` is gated by `@media (min-width: 640px)`.
- Do **not** set `aspect-ratio` or `max-width` on the canvas base style — that breaks `FitScreenAndFill` on mobile.

## Audio Service Rules

- `AudioService` uses `AudioContext` for scheduling. `setTimeout` is only a wake-up signal; loop timing derives from `AudioContext.currentTime`.
- Music tracks are defined in the `TRACKS` object with `bpm`, `lead` and `bass` note arrays.
- Note frequencies are in the `NOTE_FREQ` map. Add missing notes there before using them in tracks.
- `masterGain`, `musicGain` and `sfxGain` are separate for volume control.
- Mute state persists in `localStorage` under key `sabotetris:mute`.

## Common Pitfalls

1. **Do not change `displayMode` after construction** — `isMobile` is read at `SabotetrisGame` instantiation. The engine does not hot-reload display modes.
2. **Do not touch `pausedAt` in AudioService** — removed during the music scheduling refactor. `scheduleTrackLoop` uses `AudioContext` time exclusively.
3. **Board coordinates vs world coordinates** — Mobile tap handling must use `engine.screenToWorldCoordinates()`, not raw `clientX/clientY` or canvas pixel scaling, because the canvas resolution differs from CSS size on mobile.
4. **Do not add audio assets** — The project is procedural-audio-only. Generate new sounds via `AudioService` oscillators.
5. **Keep `cache: false` on dynamic Canvas actors** — `BoardActor` and `SidePanel` redraw every frame. Caching would cause stale frames.
6. **Never expose backend secrets** — only the three public `VITE_...` values belong in the frontend.

## Dependencies

- Runtime: `excalibur` ^0.29.0, `react` / `react-dom` ^19.2.6, `@supabase/supabase-js` ^2.118.0
- Dev: Vite, TypeScript ~6.0.2, ESLint (+ typescript-eslint, react-hooks, react-refresh), @vitejs/plugin-react

## License

> TODO: Add a license file and mention it in the README.

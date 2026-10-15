# Sabotetris

> The pieces are fighting back.

A chaotic twist on classic Tetris built with [Excalibur.js](https://excaliburjs.com). Stack blocks, clear lines, and survive the sabotage — then compete on global leaderboards powered by **PostgreSQL and Supabase**, or keep your scores locally.

[Play in your browser](https://paablobs.github.io/sabotetris/).

## Overview

Sabotetris plays like standard Tetris with continuous play until death, but a **Chaos Engine** periodically triggers random effects that disrupt your flow. The effect pool grows with your level — starting with 3 effects at level 1 and unlocking one new effect per level, up to 12 at level 10. Chaos fires more frequently as you advance.

Each level has a target score. When you reach it the level auto-advances seamlessly — the board stays intact, the game just gets faster and more chaotic. At level 10 the target is infinite, so you can keep playing as long as you survive.

The background color smoothly transitions between level colors as your score progresses toward the target.

## Chaos Effects

Effects unlock at each level and accumulate — effects from earlier levels remain available.

| Unlock | Effect | Description |
|--------|--------|-------------|
| L1 | Panic Drop | Piece drops to the bottom immediately |
| L1 | Locked Controls | Input freezes for a few seconds |
| L1 | Magnetic Drift | Piece drifts sideways |
| L2 | Greased Grip | Piece slips left |
| L3 | Slippery Fingers | Piece slides right |
| L4 | Spinning Out | Piece rotates |
| L5 | Gravity Surge | Piece accelerates down |
| L6 | Reverse Polarity | Controls reversed (left ↔ right) |
| L7 | Phantom Lock | A phantom block appears on the bottom half of the board |
| L8 | Color Blind | Next piece hidden from view |
| L9 | Famine | The same piece type repeats |
| L10 | Quake | Board shifts up, garbage row added at the bottom |

### Hardcore Mode

A separate single-level mode for players who want maximum chaos. Find out yourself what this is about.

## Leaderboards

- **Global rankings** — PostgreSQL stores the top 20 results for each mode, Softcore and Hardcore. Scores are shared across browsers and devices through Supabase.
- **Local rankings** — localStorage keeps a separate top 20 per mode. Existing local results are preserved, but never uploaded automatically.
- **Guest access** — Supabase Auth creates anonymous sessions protected by Cloudflare Turnstile. No email or password is required; verification may complete automatically.
- **Resilient saves** — local saving and global publication have separate status messages. Failed uploads can be retried from Game Over without duplicate submissions.
- **Local-only play** — choose PLAY LOCAL / SKIP, or play without online configuration. Online publication requires a run prepared before gameplay; local history is not synced later.

Aliases and global results are public. Scores are calculated in the browser: server-side validation and rate limits reduce abuse, but **this is a recreational leaderboard, not verified competitive scoring**. Games using debug points are excluded by the official client.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| ← → | Move piece |
| ↑ | Rotate piece |
| ↓ | Speed up descent (soft drop) |
| Space | Hard drop (slam down) |
| Esc / P | Pause / Resume |
| M | Toggle mute |

In the pause overlay: CONTINUE / RESET (full restart to level 1) / HOME.

### Mobile

Detected automatically on touch devices with a coarse pointer.

| Gesture | Action |
|---------|--------|
| Swipe left / right | Move piece |
| Swipe up | Rotate piece |
| Swipe down | Soft drop |
| Double tap | Hard drop |
| Phone back button | Pause / Resume |

## Tech Stack

- **Language** — TypeScript
- **Runtime** — [Excalibur.js](https://excaliburjs.com) v0.29
- **UI Shell** — React 19 + Vite
- **Database** — [PostgreSQL](https://www.postgresql.org/), hosted on [Supabase](https://supabase.com/)
- **Backend** — Supabase Edge Functions (Deno/TypeScript), anonymous Auth, and SQL RPCs
- **Abuse protection** — Cloudflare Turnstile, server-side input validation, and PostgreSQL-backed rate limits
- **Offline persistence** — localStorage
- **Audio** — Procedural 8-bit chiptune via Web Audio API (no binary assets)
- **Hosting and CI** — GitHub Pages + GitHub Actions

## Project Structure

```text
src/
├── engine/
│   ├── actors/       # Board and SidePanel renderers
│   ├── scenes/       # Menu, Game, GameOver, Ranking
│   ├── services/     # Gameplay, audio, local and remote rankings
│   └── Game.ts       # Engine bootstrap and scene registration
├── data/             # Tetromino definitions, level config
├── types/            # Shared types and constants
├── ui/               # React entry point
└── utils/            # Grid helpers, rotation, random, pointer activation
supabase/
├── functions/        # start-run, submit-score, shared HTTP/auth handlers
├── migrations/       # PostgreSQL schema, indexes, permissions, SQL functions
└── schedule.sql      # Daily cleanup via pg_cron
scripts/              # Version generation and isolated database test runner
tests/                # Node.js tests and PostgreSQL integration assertions
docs/                 # Supabase setup and operations guide
```

## Getting Started

Use **Node.js 24** (see [.nvmrc](.nvmrc)) and npm:

```bash
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173/sabotetris/`.
Without online configuration, the game runs locally without contacting Supabase or loading Turnstile.

### Enable global rankings

For a new setup, create `.env.local` using [.env.example](.env.example) and provide these **public, build-time** values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
```

All three are required. Restart the dev server after changing them. Never put database passwords, Supabase secret/service-role keys, or the Turnstile secret in frontend variables. `.env.local` is ignored by Git.

The backend also needs the SQL migration, anonymous Auth with Turnstile, both Edge Functions, backend secrets, and the cleanup schedule. Follow the [Supabase setup and operations guide (Spanish)](docs/supabase-setup.md) for the complete procedure, Free-plan limits, backups, and the manual acceptance checklist.

## PostgreSQL and Supabase Architecture

Supabase provides the PostgreSQL database, anonymous authentication, API, and Edge Function hosting. It is not a separate database engine.

1. Before an online game, the client reuses or creates an anonymous session and calls **start-run** to obtain a run valid for 24 hours.
2. At Game Over, **submit-score** validates the authenticated guest, run ownership, mode, name, score, and level. Matching retries return the same receipt instead of inserting duplicates.
3. SQL functions atomically insert and trim scores to the top 20 per mode, with a matching ordering index and PostgreSQL-backed rate limits shared across function instances.
4. The client reads at most 20 rows through **get_leaderboard**, cached for 60 seconds per mode.

Tables live in the unexposed `private` schema with Row Level Security enabled. Browser roles can execute the bounded read RPC, but cannot directly write scores or execute the write RPCs. Edge Functions verify the caller and use a server-only credential for writes. Scheduled cleanup removes expired run data and inactive guests without deleting public scores.

## Checks

```bash
npm test             # Node.js regression, ranking, and HTTP-handler tests
npm run test:db      # Isolated PostgreSQL tests; requires Docker
npm run check:edge   # Deno type checking via npx; first run needs network access
npm run lint
npm run build
```

Database tests cover permissions, input validation, expiry, retention, idempotency, and concurrent submissions. They use a minimal Auth-table fixture, so live Supabase Auth, CAPTCHA, gateway/CORS, Cron, and backup recovery still need the guide's manual checks.

## Deployment

GitHub Actions runs the checks on pull requests targeting `master`; pushes to `master` also deploy the frontend to GitHub Pages.

Configure the same three public `VITE_...` values separately under **Settings → Secrets and variables → Actions → Variables**. The workflow reads repository variables, not Secrets. Changes require a new build.

SQL migrations, cleanup scheduling, and Edge Function deployment are separate from the Pages workflow. Backend-only secrets stay in Supabase; they are never included in the frontend bundle.

## Versioning

The version shown on the main menu is generated automatically from the current git state via `scripts/version.mjs`. The format is `v{base}-{shortHash}`, with a `-dirty` suffix for uncommitted changes and a branch name suffix on non-`master` branches.

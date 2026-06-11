# Sabotetris

> The pieces are fighting back.

A chaotic twist on classic Tetris built with [Excalibur.js](https://excaliburjs.com). Stack blocks, clear lines, and survive the sabotage.

## Overview

Sabotetris plays like standard Tetris, but a **Chaos Engine** periodically triggers random effects that disrupt your flow. The effect pool grows with your level — 3 effects at level 1, one new effect per level, 12 at the top:

- **Input lock** — controls freeze for a few seconds  
- **Reverse controls** — left becomes right, right becomes left  
- **Panic drop** — the current piece slams down immediately
- **Phantom lock** *(L7+)* — a phantom block appears on the board
- **Color blind** *(L8+)* — the next piece is hidden from view
- **Famine** *(L9+)* — the same piece type repeats
- **Quake** *(L10)* — the board shifts up by one row

Each level has a target score. Hit it and you'll be offered the choice to advance (with a clear board) or stay in the same level.

### HARDCORE Mode

A separate single-level mode for players who want maximum chaos. Find out yourself what this is about.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| ← → | Move piece |
| ↑ | Rotate piece |
| ↓ | Speed up descent (soft drop) |
| Space | Hard drop (slam down) |
| Escape / P | Pause / Resume |
| Enter | Save score (Game Over) |
| Escape | Exit to menu (Game Over) |

### Mobile

Detected automatically on touch devices with a coarse pointer. Keyboard and mouse are unaffected on desktop.

| Gesture | Action |
|---------|--------|
| Swipe left / right | Move piece |
| Swipe up | Rotate piece |
| Swipe down | Soft drop (one cell down) |
| Double tap | Hard drop (slam down) |
| Phone back button | Pause / Resume |

Controls are the same in HARDCORE mode.

After pausing, the on-screen CONTINUE / RESET LEVEL / HOME buttons (which work for both mouse and touch) handle the rest.

## Tech Stack

- **Runtime** — [Excalibur.js](https://excaliburjs.com) v0.29 (TypeScript game engine)
- **UI Shell** — React 19 + Vite
- **Persistence** — localStorage for score rankings

## Project Structure

```
src/
├── engine/
│   ├── actors/       # Board and SidePanel renderers
│   ├── scenes/       # Menu, Game, GameOver, Ranking
│   ├── services/     # ChaosEngine, ScoreService, LevelService, RankingService
│   └── Game.ts       # Engine bootstrap and scene registration
├── data/             # Tetromino definitions
├── types/            # Shared TypeScript types and constants
├── ui/               # React entry point
└── utils/            # Grid helpers and rotation
```

## Getting Started

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`).

## Versioning

The version shown on the main menu is generated automatically from the current git state. `npm run dev` and `npm run build` invoke a small script that writes `src/generated/version.ts` with the short commit hash (and a `-dirty` suffix when there are uncommitted changes). The file is gitignored — every build gets a fresh one.

The format is `v{base}-{shortHash}`, e.g. `v2.0-f98229a` (or `v2.0-f98229a-dirty` for working-tree changes). On non-`master` branches, the branch name is appended in parentheses.

# Sabotetris

> The pieces are fighting back.

A chaotic twist on classic Tetris built with [Excalibur.js](https://excaliburjs.com). Stack blocks, clear lines, and survive the sabotage.

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

- **Runtime** — [Excalibur.js](https://excaliburjs.com) v0.29
- **UI Shell** — React 19 + Vite
- **Audio** — Procedural 8-bit chiptune via Web Audio API (no binary assets)
- **Persistence** — localStorage for rankings

## Project Structure

```
src/
├── engine/
│   ├── actors/       # Board and SidePanel renderers
│   ├── scenes/       # Menu, Game, GameOver, Ranking
│   ├── services/     # ChaosEngine, Audio, Level, Score, Ranking, Mobile, Admin
│   └── Game.ts       # Engine bootstrap and scene registration
├── data/             # Tetromino definitions, level config
├── types/            # Shared types and constants
├── ui/               # React entry point
└── utils/            # Grid helpers, rotation, random
```

## Getting Started

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`).

## Versioning

The version shown on the main menu is generated automatically from the current git state via `scripts/version.mjs`. The format is `v{base}-{shortHash}`, with a `-dirty` suffix for uncommitted changes and a branch name suffix on non-`master` branches.

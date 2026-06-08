# Sabotetris

> The pieces are fighting back.

A chaotic twist on classic Tetris built with [Excalibur.js](https://excaliburjs.com). Stack blocks, clear lines, and survive the sabotage.

## Overview

Sabotetris plays like standard Tetris, but a **Chaos Engine** periodically triggers random effects that disrupt your flow:

- **Input lock** — controls freeze for a few seconds  
- **Reverse controls** — left becomes right, right becomes left  
- **Panic drop** — the current piece slams down immediately

As your level increases, the pieces fall faster and chaos strikes more often.

## Controls

| Key | Action |
|-----|--------|
| ← → | Move piece |
| ↑ | Rotate piece |
| ↓ | Hard drop |
| Escape / P | Pause / Resume |
| Enter | Save score (Game Over) |
| Escape | Exit to menu (Game Over) |

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

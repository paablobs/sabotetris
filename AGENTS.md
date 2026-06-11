# Sabotetris — Agent Guide

A chaotic Tetris clone built with **Excalibur.js** v0.29, **React** 19, and **Vite**.

## Quick Start

1. `npm install`
2. `npm run dev` — Vite dev server (default `http://localhost:5173`)
3. `npm run build` — TypeScript check + production build
4. `npm run lint` — ESLint pass

## Build System

### Scripts (verbatim)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `node scripts/version.mjs && vite` | Dev server with version pre-generation |
| `build` | `node scripts/version.mjs && tsc -b && vite build` | Production build |
| `lint` | `eslint .` | Lint check |
| `version:gen` | `node scripts/version.mjs` | Stand-alone version generation |
| `preview` | `vite preview` | Preview production build |

### Version Generation

`scripts/version.mjs` (and `vite.config.ts` plugin) generates
`src/generated/version.ts` from git state:

- `APP_VERSION` — `v2.0-{shortHash}` or `v2.0-{shortHash}-dirty`
- `APP_BRANCH` — current branch name

The file is `.gitignore`d and regenerated on every `dev`/`build`.

### TypeScript

Project uses **TypeScript 6.0.2** with project references:

- `tsconfig.json` — root references
- `tsconfig.app.json` — app source
- `tsconfig.node.json` — Vite config / scripts

### Vite Config

- `base: '/sabotetris/'` — hardcoded subpath for deployment
- Custom `sabotetris-version` plugin writes `src/generated/version.ts`
- React plugin enabled

## Architecture

### Layer Split

1. **React shell** (`src/ui/`, `src/main.tsx`) — mounts a single `<div>` and
   instantiates the Excalibur engine. No React UI logic inside the game.
2. **Excalibur engine** (`src/engine/`) — owns the canvas, scenes, actors,
   and game loop. All rendering happens here.
3. **Data & utils** (`src/data/`, `src/utils/`, `src/types/`) — pure
   TypeScript with no framework dependencies.

### Game Engine

`src/engine/Game.ts` bootstraps `ex.Engine` with:

- `DisplayMode.Fixed` on desktop
- `DisplayMode.FitScreenAndFill` on mobile (detected at load time via
  `MobileService.isMobile`)
- `antialiasing: false` for pixel-art look
- `suppressPlayButton: true`

### Scenes

| Scene | File | Notes |
|-------|------|-------|
| Menu | `MainMenuScene.ts` | Logo + PLAY / RANKING buttons. Admin mode unlock via `L` key x5 taps. |
| Game | `GameScene.ts` | Core gameplay. ~900 lines. |
| Game Over | `GameOverScene.ts` | Score display, name entry, ranking save. |
| Ranking | `RankingScene.ts` | High-score table. |

### Actors

- `BoardActor` — renders the 10x20 grid, placed cells, current piece, ghost
  piece, and grid lines.
- `SidePanel` — renders next-piece preview, score, level, lines, target score,
  and active chaos effect.

Both use `ex.Canvas` with `cache: false` for dynamic redraw every frame.

### Services

| Service | File | Role |
|---------|------|------|
| AudioService | `AudioService.ts` | Web Audio API procedural 8-bit audio. Music + SFX. No binary assets. |
| ChaosEngine | `ChaosEngine.ts` | Applies random chaos effects per level. |
| LevelService | `LevelService.ts` | Level progression, target scores, background colours. |
| MobileService | `MobileService.ts` | Touch detection (`isMobile`) + `TouchInput` class. |
| RankingService | `RankingService.ts` | localStorage-backed score table. |
| ScoreService | `ScoreService.ts` | Score / lines counters. |
| AdminService | `AdminService.ts` | Debug mode for level jumping (bracket keys + digits). |

## Key Coding Conventions

1. **Excalibur imports** — `import * as ex from 'excalibur'` everywhere.
2. **Scene/actor methods** — `onInitialize`, `onActivate`, `onDeactivate`,
   `onPreUpdate` follow Excalibur lifecycle.
3. **Canvas rendering** — Actors use `ex.Canvas({ draw: (ctx) => ... })` with
   `cache: false` when content changes every frame.
4. **Constants** — Board geometry, colours, and layout constants live in
   `src/types/index.ts` (e.g. `CANVAS_WIDTH`, `BOARD_X`, `CELL_SIZE`).
5. **No external audio** — All sound is generated via `AudioService` using
   `OscillatorNode` and `GainNode`. Do not add binary audio files.
6. **Mobile is conditional** — `isMobile` is evaluated at module load.
   Touch listeners only register when `isMobile === true`.

## Mobile-Specific Rules

- `MobileService.ts` detects mobile via `navigator.maxTouchPoints` **and**
  `matchMedia('(pointer: coarse)')`.
- `TouchInput` attaches `pointerdown`/`pointermove`/`pointerup` to the canvas.
- Uses `engine.screenToWorldCoordinates()` to map touch points to world
  coordinates when the canvas is scaled (FitScreenAndFill mode).
- Gesture thresholds: `SWIPE_THRESHOLD = 32` px, `TAP_MAX_MOVE = 10` px,
  `TAP_MAX_DURATION_MS = 300`, `DOUBLE_TAP_MS = 300`.
- Swipe up → rotate. Swipe down → soft drop. Double tap → hard drop.
- Pause is triggered by the **phone back button** (`popstate` listener), not
  a touch gesture.

## CSS Rules

- `src/ui/index.css` sets the `#game-container` to `100%` width/height with
  `overflow: hidden`.
- The canvas has `image-rendering: pixelated` and `touch-action: none`.
- Desktop-only `max-width: 600px` is gated by `@media (min-width: 640px)`.
- Do **not** set `aspect-ratio` or `max-width` on the canvas base style —
  that breaks `FitScreenAndFill` on mobile.

## Audio Service Rules

- `AudioService` uses `AudioContext` for scheduling. `setTimeout` is only a
  wake-up signal; loop timing derives from `AudioContext.currentTime`.
- Music tracks are defined in `TRACKS` object with `bpm`, `lead`, and `bass`
  note arrays.
- Note frequencies are in `NOTE_FREQ` map. Add missing notes there before
  using them in tracks.
- `masterGain`, `musicGain`, and `sfxGain` are separate for volume control.
- Mute state persists in `localStorage` under key `sabotetris:mute`.

## Chaos Engine

- Effects are stored in `CHAOS_EFFECTS` array.
- Only the first `N` effects are unlocked, where `N = 2 + level` (max 12).
- Effects receive a `GameState` interface with callbacks for piece movement,
  rotation, input locking, phantom blocks, etc.

## Testing

> TODO: There is currently no test suite. If you add one, use the project's
> existing Vite / Vitest setup (or create one) and place tests in a `tests/`
> directory or `*.test.ts` alongside source files.

## Linting

ESLint config (`eslint.config.js`):

- `js.configs.recommended`
- `tseslint.configs.recommended`
- `reactHooks.configs.flat.recommended`
- `reactRefresh.configs.vite`
- Global ignores: `dist`

Run `npm run lint` before committing. The project enforces strict TypeScript
(`noUnusedLocals`, `noUnusedParameters`, etc.) via `tsconfig.app.json`.

## Common Pitfalls

1. **Do not change `displayMode` after construction** — `isMobile` is read at
   `SabotetrisGame` instantiation. The engine does not hot-reload display modes.
2. **Do not touch `pausedAt` in AudioService** — Removed during the music
   scheduling refactor. The `scheduleTrackLoop` method uses `AudioContext`
   time exclusively.
3. **Board coordinates vs world coordinates** — Mobile tap handling must use
   `engine.screenToWorldCoordinates()`, not raw `clientX/clientY` or canvas
   pixel scaling, because the canvas resolution differs from CSS size on
   mobile.
4. **Do not add audio assets** — The project is procedural-audio-only. If you
   need new sounds, generate them via `AudioService` oscillators.
5. **Keep `cache: false` on dynamic Canvas actors** — `BoardActor` and
   `SidePanel` redraw every frame. Caching would cause stale frames.

## File Inventory (important)

```
scripts/version.mjs       # Git → version.ts generator
vite.config.ts            # Vite config + base path + version plugin
src/engine/Game.ts        # Engine bootstrap
src/engine/scenes/        # All game scenes
src/engine/actors/        # BoardActor, SidePanel
src/engine/services/      # Audio, Chaos, Mobile, Score, Level, Ranking, Admin
src/data/levels.ts        # Level definitions (maxScore, bg colour, speed)
src/data/tetrominoes.ts   # Piece shapes and colours
src/types/index.ts        # Constants, interfaces, types
src/ui/index.css          # Global styles + canvas sizing
src/ui/App.tsx            # React entry point (minimal)
```

## Dependencies

- `excalibur` ^0.29.0
- `react` ^19.2.6
- `react-dom` ^19.2.6

Dev dependencies: Vite, TypeScript ~6.0.2, ESLint, @vitejs/plugin-react.

## License

> TODO: Add license file or mention in README.

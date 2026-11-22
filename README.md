# Sabotetris

> The pieces are fighting back.

<a href="docs/sabotetris-demo.mp4">
  <img src="docs/sabotetris-demo.gif" alt="Sabotetris demo: stacking and clearing lines while random chaos effects sabotage the falling piece, then levelling up" width="100%" />
</a>

<sub>Silent walkthrough. Click it for the full-quality <a href="docs/sabotetris-demo.mp4">MP4</a>.</sub>

Sabotetris is classic Tetris with a twist: while you stack blocks and clear lines, a **Chaos Engine** keeps sabotaging you with random effects. Survive as long as you can and climb the leaderboards.

**[Play in your browser](https://paablobs.github.io/sabotetris/)**

## How it works

- Play like standard Tetris, continuously, until you die.
- Every so often, a random **chaos effect** hits: your piece drops, your controls freeze, the board shakes, and more.
- Each level has a target score. Reach it and the next level starts automatically. The board stays as it is, but the game gets faster and more chaotic.
- Higher levels unlock new effects. You start with 3 and reach 12 by level 10, and chaos strikes more often as you advance.
- Level 10 has no target score, so you can keep going as long as you survive.
- The background color slowly shifts as you approach the next level.

## Chaos effects

Effects unlock level by level and stay in the pool once unlocked.

| Unlock | Effect | What it does |
|--------|--------|--------------|
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

### Hardcore mode

A separate single-level mode for players who want maximum chaos. Find out for yourself what it's about.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| ← → | Move piece |
| ↑ | Rotate piece |
| ↓ | Soft drop (speed up descent) |
| Space | Hard drop (slam down) |
| Esc / P | Pause / Resume |
| M | Toggle mute |

The pause menu offers CONTINUE, RESET (restart from level 1) and HOME.

### Mobile

Touch devices are detected automatically.

| Gesture | Action |
|---------|--------|
| Swipe left / right | Move piece |
| Swipe up | Rotate piece |
| Swipe down | Soft drop |
| Double tap | Hard drop |
| Phone back button | Pause / Resume |

## Leaderboards

- **Global ranking** — The top 20 scores for each mode (Softcore and Hardcore) are shared across all players and devices.
- **Local ranking** — Your own top 20 per mode, stored in your browser.
- **No account needed** — You play as a guest: no email or password. You may be asked to complete a quick automatic human check.
- **Local-only play** — Choose PLAY LOCAL / SKIP to keep your scores on your device only.
- **Failed upload?** — You can retry from the Game Over screen without creating duplicates.

Names and global scores are public. Scores are calculated in your browser, so this is a **recreational leaderboard, not verified competitive scoring**.

# Sabotetris demo video

Silent walkthrough of the game, built with [Remotion](https://www.remotion.dev/). The rendered file
lives at `../docs/sabotetris-demo.mp4` and is embedded in the root README (as an inline GIF that links
to the MP4).

This folder is a standalone npm project (own lockfile) so it does not affect the game's dependencies,
build, tests, lint or Vite bundle.

## How it works

1. `capture/record.mjs` drives the real game with Playwright (a desktop run and a Pixel 7 touch run)
   and writes `public/desktop.mp4`, `public/phone.mp4` and `public/markers.json` (chapter timestamps
   plus the chaos effects, level-ups and keystrokes / gestures that really happened). All three are
   generated and git-ignored.
   - The game is a canvas, so there are no test ids. Menu buttons are clicked by game-world
     coordinates, and a visible cursor / click ripple is injected because headless recordings have none.
   - A small bot plays the actual game. It hooks `GameSimulation` from the page (no game source is
     modified) and looks at the board to pick placements. On desktop it presses arrow keys / Space; on
     the phone it dispatches touch pointer events on the canvas (swipes and a double tap), which is
     all the game's touch layer listens to.
   - To keep a short clip varied, the script nudges the run: it triggers an engine chaos roll at a few
     moments and tops up the score to jump to the next level. The effect itself is still chosen and
     applied by the game's own Chaos Engine.
   - Piece order is seeded (`SEED`, default `7`) so recordings are repeatable. Try another seed if the
     bot tops out; the script says so.
   - Frames are captured over CDP and stamped with a monotonic clock, then encoded with their real
     timing, so the markers stay aligned with the footage (Playwright's own `recordVideo` times frames
     by count and drifts, and WSL2 steps the wall clock, so `Date.now()` is not used).
2. `src/Video.tsx` composes the clips with the intro, chapter captions, live chaos / level chips, the
   keyboard and gesture overlays, a phone frame and the outro.

## Re-render

```bash
# terminal 1, from the repo root. IMPORTANT: blank the online-ranking variables so the recording is
# local-only and can never start a run or publish a score (.env.local may hold real keys).
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_TURNSTILE_SITE_KEY= npm run dev

# terminal 2
cd video
npm install
npx playwright install chromium   # once, if the browser is missing
npm run record                    # re-record desktop + phone (needs the dev server above)
node capture/record.mjs phone     # or just one of them: desktop | phone
npm run studio                    # optional: preview in Remotion Studio
npm run render                    # writes out/sabotetris-demo.mp4
cp out/sabotetris-demo.mp4 ../docs/sabotetris-demo.mp4

# README GIF (plays inline on GitHub). Remotion's bundled ffmpeg has no fps filter, so use -r.
npx remotion ffmpeg -y -i out/sabotetris-demo.mp4 -r 10 \
  -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 ../docs/sabotetris-demo.gif
```

`record` expects the dev server at `http://localhost:5173/sabotetris/`; set `SABOTETRIS_URL` if Vite
picked another port. As a second safety net the script aborts every request to Supabase and Cloudflare
Turnstile.

Keep the GIF under 10 MB if you upload it through the GitHub web editor. Edit the scripted flow in
`capture/record.mjs`, and captions and timing in `src/Video.tsx`.

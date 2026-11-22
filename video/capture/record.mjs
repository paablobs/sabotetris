// Records scripted walkthroughs of the real Sabotetris game with Playwright.
//
// Needs the dev server running with ONLINE RANKING DISABLED (see ../README.md):
//   VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_TURNSTILE_SITE_KEY= npm run dev
// As a second safety net, every request to Supabase / Cloudflare Turnstile is aborted below, so a
// recording can never create a run or publish a score.
//
// Outputs: public/desktop.mp4, public/phone.mp4 and public/markers.json (chapter timestamps,
// chaos / level-up / keystroke logs). All three are generated and git-ignored.
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const tmpDir = path.join(here, "..", ".tmp-video");
const BASE = process.env.SABOTETRIS_URL ?? "http://localhost:5173/sabotetris/";
const SEED = process.env.SEED ?? "7";
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const CANVAS_W = 540; // game world size, see src/types/index.ts
const CANVAS_H = 700;

/* ---------- page-side helpers (serialised into the browser) ---------- */

// Deterministic piece order: the game seeds its RNG from crypto.getRandomValues(16 bytes).
const seedRandom = (seed) => {
  let s = Number(seed) >>> 0 || 1;
  const orig = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (arr) => {
    if (arr instanceof Uint8Array && arr.length === 16) {
      for (let i = 0; i < 16; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        arr[i] = s >>> 24;
      }
      return arr;
    }
    return orig(arr);
  };
  localStorage.setItem("sabotetris:seenTutorial", "true"); // skip the first-visit overlay
};

// Visible cursor + click ripple + touch dot (headless recordings have no pointer).
const overlay = () => {
  const init = () => {
    if (document.getElementById("__cursor")) return;
    const style = document.createElement("style");
    style.textContent =
      "@keyframes __rip{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}";
    document.documentElement.appendChild(style);
    const touch = matchMedia("(pointer: coarse)").matches;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))";
    c.innerHTML = touch
      ? '<div style="width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(77,208,255,.45);border:2px solid #4dd0ff"></div>'
      : '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    if (touch) c.style.display = "none";
    const ripple = (x, y) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:56px;height:56px;border-radius:50%;background:rgba(255,77,109,.55);z-index:2147483646;pointer-events:none;animation:__rip .55s ease-out forwards`;
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 600);
    };
    addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`), true);
    addEventListener("mousedown", (e) => ripple(e.clientX, e.clientY), true);
    // Touch: show a dot that follows the finger.
    addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;
        c.style.display = "block";
        c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        ripple(e.clientX, e.clientY);
      },
      true,
    );
    addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType === "touch") c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      },
      true,
    );
    addEventListener("pointerup", (e) => e.pointerType === "touch" && (c.style.display = "none"), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", init);
  else init();
};

// Hooks the real game simulation (no app source is modified) and installs a Tetris bot.
// The dev server serves the same module instance the game imports, so patching the prototype works.
const installBot = async ({ base, mode }) => {
  const root = new URL(base).pathname; // "/sabotetris/"
  const sim = await import(`${root}supabase/functions/_shared/game/simulation.ts`);
  const helpers = await import(`${root}supabase/functions/_shared/game/helpers.ts`);
  const pieces = await import(`${root}supabase/functions/_shared/game/pieces.ts`);
  const COLS = 10;
  const ROWS = 20;
  const log = [];
  window.__log = log;
  window.__force = 0;

  const orig = sim.GameSimulation.prototype.step;
  sim.GameSimulation.prototype.step = function (actions) {
    window.__sim = this;
    orig.call(this, actions);
    // Optionally trigger the engine's own chaos roll right now (keeps the clip short).
    if (window.__force > 0 && !this.gameOver) {
      window.__force--;
      this.triggerChaos();
    }
    const p = this.presentation;
    const t = performance.now();
    if (p.chaos) log.push({ t, type: "chaos", name: p.chaos, level: this.levels.getLevel() });
    if (p.levelUp) log.push({ t, type: "level", level: this.levels.getLevel() });
    if (p.lineClear) log.push({ t, type: "line", lines: this.lines });
  };

  // Heuristic placement search (aggregate height, lines, holes, bumpiness).
  const evaluate = (grid, shape, row, col) => {
    const cells = grid.map((r) => r.map((c) => c !== null));
    shape.forEach((r, y) => r.forEach((v, x) => v && (cells[row + y][col + x] = true)));
    let lines = 0;
    const kept = cells.filter((r) => !r.every(Boolean));
    lines = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(false));
    const heights = Array(COLS).fill(0);
    let holes = 0;
    for (let x = 0; x < COLS; x++) {
      let seen = false;
      for (let y = 0; y < ROWS; y++) {
        if (kept[y][x]) {
          if (!seen) heights[x] = ROWS - y;
          seen = true;
        } else if (seen) holes++;
      }
    }
    const agg = heights.reduce((a, b) => a + b, 0);
    let bump = 0;
    for (let x = 0; x < COLS - 1; x++) bump += Math.abs(heights[x] - heights[x + 1]);
    return -0.51 * agg + 0.76 * lines - 0.36 * holes - 0.18 * bump;
  };
  const plan = (s) => {
    const p = s.currentPiece;
    let best = null;
    let shape = pieces.TETROMINOES[p.type].shape;
    for (let rot = 0; rot < 4; rot++) {
      for (let col = -2; col < COLS; col++) {
        if (!helpers.isValidPosition(s.grid, shape, 0, col)) continue;
        let row = 0;
        while (helpers.isValidPosition(s.grid, shape, row + 1, col)) row++;
        const score = evaluate(s.grid, shape, row, col);
        if (!best || score > best.score) best = { score, rot, col };
      }
      shape = helpers.rotateMatrix(shape);
    }
    return best;
  };
  let pieceKey = "";
  let attempts = 0;
  window.__bot = {
    // Returns the next key to press ("ArrowLeft" ...), "Space" when aligned, or null to wait.
    next() {
      const s = window.__sim;
      if (!s || s.gameOver || !s.currentPiece) return null;
      if (s.ignoreTimer > 0) return null;
      const p = s.currentPiece;
      const key = `${p.type}:${s.ticks > 0 ? s.lines : 0}:${s.score}`;
      if (key !== pieceKey) {
        pieceKey = key;
        attempts = 0;
      }
      const best = plan(s);
      if (!best) return "Space";
      attempts++;
      if (attempts > 16) return "Space"; // blocked rotation / sabotage: just drop it
      if (p.rotation !== best.rot) return "ArrowUp";
      if (p.col !== best.col) {
        const wantLeft = best.col < p.col;
        return wantLeft !== s.reverseTimer > 0 ? "ArrowLeft" : "ArrowRight";
      }
      return "Space";
    },
    state() {
      const s = window.__sim;
      return s && { over: s.gameOver, level: s.levels.getLevel(), score: s.score, lines: s.lines };
    },
    // Make the next piece lock complete the current level (the engine advances on its own).
    levelUp() {
      const s = window.__sim;
      s.score = Math.max(s.score, s.levelStartScore + s.levels.getMaxScore());
    },
    chaos() {
      window.__force++;
    },
  };

  // Autoplay runs inside the page: no CDP round trip per key, so the pace stays human-like even
  // while the renderer is busy recording. Excalibur only listens to window keyboard events.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (type, key) =>
    window.dispatchEvent(
      new KeyboardEvent(type, { key, code: key === " " ? "Space" : key, bubbles: true, cancelable: true }),
    );
  // Touch mode: synthetic touch pointer events on the canvas, which is all TouchInput listens to.
  // Swipes mirror the README: left / right move, up rotates, down soft-drops, double tap hard-drops.
  const canvas = document.querySelector("canvas");
  const ptr = (type, x, y) =>
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }),
    );
  const touchAt = () => {
    // Mobile uses FitScreenAndFill: the canvas covers the screen and the 540x700 game is letterboxed.
    const r = canvas.getBoundingClientRect();
    const k = Math.min(r.width / 540, r.height / 700);
    return { x: r.left + (r.width - 540 * k) / 2 + 180 * k, y: r.top + (r.height - 700 * k) / 2 + 350 * k };
  };
  const swipe = async (dx, dy) => {
    const { x, y } = touchAt();
    ptr("pointerdown", x, y);
    await wait(40);
    ptr("pointermove", x + dx / 2, y + dy / 2);
    await wait(25);
    ptr("pointermove", x + dx, y + dy);
    await wait(25);
    ptr("pointerup", x + dx, y + dy);
  };
  const doubleTap = async () => {
    const { x, y } = touchAt();
    for (let i = 0; i < 2; i++) {
      ptr("pointerdown", x, y);
      await wait(45);
      ptr("pointerup", x, y);
      if (i === 0) await wait(70);
    }
  };
  const SWIPE = 50;
  const tap = async (key, hold) => {
    if (mode === "touch") {
      log.push({ t: performance.now(), type: "key", k: key, d: 0.2 });
      if (key === "ArrowLeft") return swipe(-SWIPE, 0);
      if (key === "ArrowRight") return swipe(SWIPE, 0);
      if (key === "ArrowUp") return swipe(0, -SWIPE);
      if (key === "ArrowDown") return swipe(0, SWIPE);
      return doubleTap(); // Space = hard drop
    }
    const k = key === "Space" ? " " : key;
    log.push({ t: performance.now(), type: "key", k: key, d: hold / 1000 });
    fire("keydown", k);
    await wait(hold);
    fire("keyup", k);
  };
  const stackHeight = (s) => ROWS - Math.max(0, s.grid.findIndex((r) => r.some((c) => c !== null)));
  let running = false;
  window.__bot.autoplay = async () => {
    running = true;
    let piece = 0;
    while (running) {
      const s = window.__sim;
      if (s?.gameOver) {
        window.__over = { level: s.levels.getLevel() };
        return;
      }
      const key = window.__bot.next();
      if (!key) {
        await wait(40);
        continue;
      }
      if (key === "Space") {
        piece++;
        // Show off the soft drop now and then (only while the stack is low).
        if (mode !== "touch" && piece % 3 === 0 && stackHeight(s) < 9) await tap("ArrowDown", 420);
        await tap("Space", 50);
        await wait(260);
      } else {
        await tap(key, 40);
        await wait(70);
      }
    }
  };
  window.__bot.stop = () => (running = false);
};

/* ---------- node-side driver ---------- */

const SPEED = 0.62; // <1 = faster pacing (menu / cursor only; gameplay runs in real time)
const sleep = (ms, speed = SPEED) => new Promise((r) => setTimeout(r, ms * speed));
const real = (ms) => sleep(ms, 1);

// Encodes timestamped JPEG frames to public/<name>.mp4 (30 fps, constant) with their real timing.
function encode(name, frames, t0, endT) {
  const dir = path.join(tmpDir, `frames-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const times = frames.map((f, i) => (i === 0 ? 0 : (f.t - t0) / 1000)); // hold frame 0 from t=0
  const list = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const file = `${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, "base64"));
    const next = i + 1 < frames.length ? times[i + 1] : (endT - t0) / 1000;
    list.push(`file '${file}'`, `duration ${Math.max(next - times[i], 0.001).toFixed(5)}`);
  });
  list.push(`file '${String(frames.length - 1).padStart(5, "0")}.jpg'`); // concat quirk: repeat last
  fs.writeFileSync(path.join(dir, "list.txt"), list.join("\n"));
  fs.mkdirSync(publicDir, { recursive: true });
  const remotion = path.join(here, "..", "node_modules", ".bin", "remotion");
  execFileSync(
    remotion,
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
      "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
      "-pix_fmt", "yuv420p", path.join(publicDir, `${name}.mp4`)],
    { stdio: "inherit" },
  );
  console.log(`${name}: ${frames.length} frames over ${((endT - t0) / 1000).toFixed(1)}s -> public/${name}.mp4`);
}

async function run(name, contextOptions, flow) {
  // Software WebGL (SwiftShader, the default on hosts without a GPU such as WSL2) renders this game
  // at ~16 fps. Mesa llvmpipe through ANGLE-GL holds 60 fps.
  const browser = await chromium.launch({ args: ["--use-angle=gl", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext(contextOptions);
  // Safety net: never talk to the online ranking backend or the CAPTCHA.
  await context.route(/supabase\.(co|in)|challenges\.cloudflare\.com/, (r) => r.abort());
  await context.addInitScript(seedRandom, SEED);
  await context.addInitScript(overlay);
  const page = await context.newPage();
  // Monotonic clock only: WSL2 steps the wall clock (Date.now) by seconds during long runs.
  const mono = () => Number(process.hrtime.bigint()) / 1e6;
  // Screen capture over CDP instead of Playwright's recordVideo: recordVideo times its frames by
  // count, so the video drifts from real time whenever the renderer hiccups. Here every frame is
  // stamped on the monotonic clock and the encoder reproduces exactly that timing, which keeps the
  // chapter / chaos / keystroke markers aligned with the footage.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    frames.push({ t: mono(), data });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const t0 = mono();
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    maxWidth: contextOptions.viewport.width,
    maxHeight: contextOptions.viewport.height,
    everyNthFrame: 1,
  });
  const markers = {};
  const now = () => (mono() - t0) / 1000;
  const mark = (label) => (markers[label] = now());

  await page.goto(BASE);
  await page.waitForSelector("canvas");
  await page.evaluate(installBot, { base: BASE, mode: contextOptions.hasTouch ? "touch" : "keys" });
  await sleep(900);

  const world = async (wx, wy) => {
    // Desktop: canvas is exactly 540x700. Mobile: canvas covers the screen, game is letterboxed.
    const bb = await page.locator("canvas").boundingBox();
    const k = Math.min(bb.width / CANVAS_W, bb.height / CANVAS_H);
    return {
      x: bb.x + (bb.width - CANVAS_W * k) / 2 + wx * k,
      y: bb.y + (bb.height - CANVAS_H * k) / 2 + wy * k,
    };
  };
  let cur = { x: contextOptions.viewport.width / 2, y: contextOptions.viewport.height / 2 };
  const glide = async (x, y, ms = 550) => {
    const steps = Math.max(12, Math.round(ms / 16));
    const from = cur;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await sleep(ms / steps);
    }
    cur = { x, y };
  };
  // Click a spot of the canvas by its game-world coordinates.
  const clickWorld = async (wx, wy, { pause = 500 } = {}) => {
    const { x, y } = await world(wx, wy);
    await glide(x, y);
    await sleep(120);
    await page.mouse.down();
    await sleep(60);
    await page.mouse.up();
    await sleep(pause);
  };
  // Touch equivalent of clickWorld (phone recordings have no mouse).
  const tapWorld = async (wx, wy, { pause = 500 } = {}) => {
    const { x, y } = await world(wx, wy);
    await page.touchscreen.tap(x, y);
    await sleep(pause);
  };
  const api = { page, clickWorld, tapWorld, glide, sleep, real, mark, world, now };

  if (!contextOptions.hasTouch) await page.mouse.move(cur.x, cur.y);
  await sleep(700);
  mark("start");
  await flow(api);
  mark("end");
  await sleep(600);

  // In-page events carry performance.now(); map it onto the node clock (video time) once.
  const pageNow = await page.evaluate(() => performance.now());
  const offset = now() - pageNow / 1000;
  const log = await page.evaluate(() => window.__log ?? []);
  const events = log.map(({ t, ...rest }) => ({ at: +(t / 1000 + offset).toFixed(3), ...rest }));
  markers.events = events.filter((e) => e.type !== "key");
  markers.keys = events.filter((e) => e.type === "key").map(({ at, k, d }) => ({ at, k, d }));

  const endT = mono();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await context.close();
  await browser.close();
  encode(name, frames, t0, endT);
  return markers;
}

/* ---------- flows ---------- */

// Lets the in-page bot play for `seconds`, running `cues` ({ at, run }) on the way.
const play = async ({ page, real }, seconds, cues = []) => {
  const begin = performance.now();
  const queue = [...cues].sort((a, b) => a.at - b.at);
  await page.evaluate(() => void window.__bot.autoplay());
  for (;;) {
    const elapsed = (performance.now() - begin) / 1000;
    if (elapsed >= seconds) break;
    while (queue.length && queue[0].at <= elapsed) await queue.shift().run();
    const over = await page.evaluate(() => window.__over);
    if (over) throw new Error(`Bot topped out at ${elapsed.toFixed(1)}s (level ${over.level}); try another SEED`);
    await real(250);
  }
  await page.evaluate(() => window.__bot.stop());
};

const desktopFlow = async (api) => {
  const { clickWorld, real, mark, page } = api;
  const bot = (fn) => ({ run: () => page.evaluate(fn) });
  // 1. Main menu, then the in-game tutorial overlay
  mark("menu");
  await real(1700);
  mark("howto");
  await clickWorld(270, 570, { pause: 3600 }); // TUTORIAL
  await clickWorld(270, 662, { pause: 600 }); // BACK
  // 2. Play. The bot stacks and clears lines; cues stage chaos and level-ups so a short clip
  //    shows the whole loop (the engine itself still picks the effect and applies it).
  mark("play");
  await clickWorld(270, 390, { pause: 0 }); // PLAY
  await page.evaluate(() => (document.getElementById("__cursor").style.display = "none"));
  const chaos = bot(() => window.__bot.chaos());
  const levelUp = bot(() => window.__bot.levelUp());
  await play(api, 41, [
    { at: 4, ...chaos },
    { at: 11, ...levelUp },
    { at: 21, ...levelUp },
    { at: 24, ...chaos },
    { at: 33, ...levelUp },
    { at: 37, ...chaos },
  ]);
};

const phoneFlow = async (api) => {
  const { tapWorld, real, mark, page } = api;
  const chaos = { run: () => page.evaluate(() => window.__bot.chaos()) };
  mark("menu");
  await real(1500);
  mark("play");
  await tapWorld(270, 390, { pause: 0 }); // PLAY
  await play(api, 17, [{ at: 6, ...chaos }]);
};

const which = process.argv[2] ?? "all";
const out = {};
if (which === "all" || which === "desktop") {
  out.desktop = await run(
    "desktop",
    { viewport: { width: CANVAS_W, height: CANVAS_H }, deviceScaleFactor: 1 },
    desktopFlow,
  );
}
if (which === "all" || which === "phone") {
  const p7 = devices["Pixel 7"];
  out.phone = await run("phone", { ...p7, viewport: { width: 412, height: 760 }, deviceScaleFactor: 1 }, phoneFlow);
}
const mpath = path.join(publicDir, "markers.json");
const prev = fs.existsSync(mpath) ? JSON.parse(fs.readFileSync(mpath, "utf8")) : {};
fs.writeFileSync(mpath, JSON.stringify({ ...prev, ...out }, null, 2));
for (const [name, m] of Object.entries(out)) {
  console.log(name, JSON.stringify({ ...m, keys: m.keys.length, events: m.events.length }));
}

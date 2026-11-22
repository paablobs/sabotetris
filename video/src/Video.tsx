import React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import markers from "../public/markers.json";
import { colors, fontFamily, FPS } from "./theme";

const sec = (s: number) => Math.round(s * FPS);

/* ---------- recorded markers (see capture/record.mjs) ---------- */
type Ev = { at: number; type: "chaos" | "level" | "line"; name?: string; level?: number };
type Key = { at: number; k: string; d: number };
type Clip = {
  start: number;
  menu: number;
  howto: number;
  play: number;
  end: number;
  events: Ev[];
  keys: Key[];
};
const D = markers.desktop as unknown as Clip;
const P = markers.phone as unknown as Clip;

/* ---------- timing ---------- */
const INTRO = sec(3);
const OUTRO = sec(3.5);
const DESKTOP_TRIM = D.menu - 0.3;
const DESKTOP_LEN = sec(D.end - DESKTOP_TRIM + 0.4);
const PHONE_TRIM = P.menu - 0.3;
const PHONE_LEN = sec(P.end - PHONE_TRIM + 0.4);
const XFADE = sec(0.4);

export const TOTAL_FRAMES = INTRO + DESKTOP_LEN + PHONE_LEN + OUTRO - 3 * XFADE;

/* ---------- copy ---------- */
type Chapter = { at: number; title: string; sub: string };
const firstChaos = D.events.find((e) => e.type === "chaos")?.at ?? D.play + 5;
const firstLevelUp = D.events.find((e) => e.type === "level")?.at ?? D.play + 12;
const desktopChapters: Chapter[] = [
  {
    at: D.menu,
    title: "Chaotic Tetris, in your browser",
    sub: "Classic stacking, plus a Chaos Engine that fights back",
  },
  {
    at: D.howto,
    title: "Learn it in seconds",
    sub: "A built-in tutorial covers the goal, the sabotage and the controls",
  },
  {
    at: D.play,
    title: "Stack and clear lines",
    sub: "Move, rotate and drop pieces with the keyboard. Swipes on mobile",
  },
  {
    at: firstChaos - 0.4,
    title: "Then the pieces fight back",
    sub: "Every few seconds a random chaos effect disrupts your piece",
  },
  {
    at: firstLevelUp - 0.4,
    title: "Level up, more chaos",
    sub: "Hit the target score: the game speeds up and unlocks new effects",
  },
];

const phoneFirstChaos = P.events.find((e) => e.type === "chaos")?.at ?? P.play + 6;
const phoneChapters: Chapter[] = [
  {
    at: P.menu,
    title: "Made for touch screens too",
    sub: "The game fits any phone screen, straight from the browser",
  },
  {
    at: P.play,
    title: "Swipe to play",
    sub: "Swipe to move and rotate, double tap to slam a piece down",
  },
  {
    at: phoneFirstChaos - 0.4,
    title: "Same sabotage, in your pocket",
    sub: "The Chaos Engine works exactly the same on mobile",
  },
];

// Same wording as the Chaos Effects table in the README.
const effectInfo: Record<string, string> = {
  "Panic Drop": "The piece drops to the bottom immediately",
  "Locked Controls": "Input freezes for a few seconds",
  "Magnetic Drift": "The piece drifts sideways",
  "Greased Grip": "The piece slips left",
  "Slippery Fingers": "The piece slides right",
  "Spinning Out": "The piece rotates",
  "Gravity Surge": "The piece accelerates down",
  "Reverse Polarity": "Controls reversed (left and right swap)",
  "Phantom Lock": "A phantom block appears on the board",
  "Color Blind": "The next piece is hidden from view",
  Famine: "The same piece type repeats",
  Quake: "The board shifts up and a garbage row appears",
};

type Chip = { at: number; kind: "chaos" | "level"; title: string; sub: string };
const buildChips = (clip: Clip): Chip[] =>
  clip.events
  .filter((e) => e.type === "chaos" || e.type === "level")
  .map((e) =>
    e.type === "chaos"
      ? {
          at: e.at,
          kind: "chaos" as const,
          title: (e.name ?? "").toUpperCase(),
          sub: effectInfo[e.name ?? ""] ?? "",
        }
      : {
          at: e.at,
          kind: "level" as const,
          title: `LEVEL ${e.level}`,
          sub: "Faster pieces, more frequent chaos",
        },
  );
const desktopChips = buildChips(D);
const phoneChips = buildChips(P);
const CHIP_LIFE = 3.4;

/* ---------- shared bits ---------- */
const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1200px 700px at 50% 0%, ${colors.bgAlt} 0%, ${colors.bg} 70%)`,
    }}
  />
);

const useFade = (durationInFrames: number, fadeIn = XFADE, fadeOut = XFADE) => {
  const frame = useCurrentFrame();
  const inV = interpolate(frame, [0, fadeIn], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (fadeOut === 0) return inV;
  const outV = interpolate(
    frame,
    [durationInFrames - fadeOut, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return Math.min(inV, outV);
};

const Caption: React.FC<{ trim: number; chapters: Chapter[] }> = ({ trim, chapters }) => {
  const frame = useCurrentFrame();
  const t = trim + frame / FPS;
  let idx = 0;
  chapters.forEach((c, i) => {
    if (t >= c.at) idx = i;
  });
  const c = chapters[idx];
  const local = (t - c.at) * FPS;
  const enter = interpolate(local, [0, 14], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * 16}px)` }}>
      <div style={{ fontSize: 54, fontWeight: 700, color: colors.text, letterSpacing: -1.5, lineHeight: 1.1 }}>
        {c.title}
      </div>
      <div style={{ fontSize: 27, color: colors.muted, marginTop: 14, lineHeight: 1.4, maxWidth: 780 }}>
        {c.sub}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
        {chapters.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === idx ? 34 : 10,
              height: 10,
              borderRadius: 5,
              background: i === idx ? colors.accent : colors.border,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/** The latest chaos effect / level-up, shown for a few seconds like the game's own side-panel label. */
const EventChip: React.FC<{ trim: number; chips: Chip[] }> = ({ trim, chips }) => {
  const frame = useCurrentFrame();
  const t = trim + frame / FPS;
  const live = chips.filter((c) => t >= c.at && t < c.at + CHIP_LIFE);
  const chip = live[live.length - 1];
  if (!chip) return null;
  const local = (t - chip.at) * FPS;
  const enter = interpolate(local, [0, 8], [0, 1], {
    easing: Easing.out(Easing.back(1.6)),
    extrapolateRight: "clamp",
  });
  const leave = interpolate(t - chip.at, [CHIP_LIFE - 0.4, CHIP_LIFE], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tint = chip.kind === "chaos" ? colors.accent : colors.green;
  return (
    <div
      style={{
        opacity: enter * leave,
        transform: `translateX(${(1 - enter) * -30}px)`,
        display: "inline-flex",
        flexDirection: "column",
        gap: 6,
        padding: "18px 28px",
        borderRadius: 6,
        border: `2px solid ${tint}`,
        background: `${tint}22`,
        minWidth: 520,
      }}
    >
      <div style={{ fontSize: 15, letterSpacing: 4, color: tint }}>
        {chip.kind === "chaos" ? "CHAOS EFFECT" : "LEVEL UP"}
      </div>
      <div style={{ fontSize: 40, fontWeight: 700, color: colors.text }}>{chip.title}</div>
      <div style={{ fontSize: 22, color: colors.muted }}>{chip.sub}</div>
    </div>
  );
};

/** Keyboard overlay driven by the keys the recorder really pressed. */
const KeyHud: React.FC<{ trim: number }> = ({ trim }) => {
  const frame = useCurrentFrame();
  const t = trim + frame / FPS;
  const down = (code: string) => D.keys.some((k) => k.k === code && t >= k.at - 0.02 && t <= k.at + Math.max(k.d, 0.1) + 0.12);
  const visible = interpolate(t, [D.play, D.play + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cap = (code: string, label: string, w = 84) => {
    const on = down(code);
    return (
      <div
        style={{
          width: w,
          height: 84,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: label.length > 2 ? 24 : 38,
          color: on ? colors.bg : colors.text,
          background: on ? colors.blue : colors.panel,
          border: `2px solid ${on ? colors.blue : colors.border}`,
          boxShadow: on ? `0 0 28px ${colors.blue}88` : "none",
          transform: on ? "translateY(3px)" : "none",
        }}
      >
        {label}
      </div>
    );
  };
  const hint = (text: string) => <span style={{ color: colors.dim, fontSize: 22 }}>{text}</span>;
  return (
    <div style={{ opacity: visible, display: "flex", alignItems: "center", gap: 36 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <div>{cap("ArrowUp", "↑")}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {cap("ArrowLeft", "←")}
          {cap("ArrowDown", "↓")}
          {cap("ArrowRight", "→")}
        </div>
        {cap("Space", "SPACE", 282)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, lineHeight: 1 }}>
        {hint("← → move")}
        {hint("↑ rotate")}
        {hint("↓ soft drop")}
        {hint("space hard drop")}
      </div>
    </div>
  );
};

/** Touch legend driven by the gestures the recorder really performed (same log as the keys). */
const GestureHud: React.FC<{ trim: number }> = ({ trim }) => {
  const frame = useCurrentFrame();
  const t = trim + frame / FPS;
  const active = (codes: string[]) =>
    P.keys.some((k) => codes.includes(k.k) && t >= k.at - 0.02 && t <= k.at + Math.max(k.d, 0.1) + 0.2);
  const visible = interpolate(t, [P.play, P.play + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const row = (codes: string[], gesture: string, action: string) => {
    const on = active(codes);
    return (
      <div
        key={action}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "12px 22px",
          width: 520,
          borderRadius: 10,
          border: `2px solid ${on ? colors.blue : colors.border}`,
          background: on ? `${colors.blue}22` : colors.panel,
          boxShadow: on ? `0 0 24px ${colors.blue}55` : "none",
        }}
      >
        <div style={{ width: 230, fontSize: 26, color: on ? colors.blue : colors.text }}>{gesture}</div>
        <div style={{ fontSize: 24, color: colors.muted }}>{action}</div>
      </div>
    );
  };
  return (
    <div style={{ opacity: visible, display: "flex", flexDirection: "column", gap: 12 }}>
      {row(["ArrowLeft", "ArrowRight"], "Swipe ← / →", "move")}
      {row(["ArrowUp"], "Swipe ↑", "rotate")}
      {row(["Space"], "Double tap", "hard drop")}
    </div>
  );
};

/* ---------- scenes ---------- */
const Logo: React.FC<{ size: number }> = ({ size }) => {
  // Geometry copied from the in-game logo (MainMenuScene.createLogo).
  const b = (x: number, y: number, fill: string, key: string) => (
    <rect key={key} x={x} y={y} width={14} height={14} rx={2} fill={fill} />
  );
  const red = "#ff4d6d";
  const ghost = "rgba(255, 77, 109, 0.55)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.26 }}>
      <svg width={size * 1.05} height={size * 1.1} viewBox="-2 -2 106 106">
        {[[14, 0], [0, 14], [14, 14], [28, 14]].map(([x, y]) => b(x, y, colors.purple, `p${x}${y}`))}
        {[[0, 32], [0, 46], [0, 60], [14, 60]].map(([x, y]) => b(x, y, colors.blue, `b${x}${y}`))}
        {[18, 32, 46, 60].map((x) => b(x, 78, ghost, `g${x}`))}
        {[40, 54, 68, 82].map((x) => b(x, 82, red, `r${x}`))}
        <path d="M20 96 L38 88 L58 98 L86 84" stroke={red} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={24} cy={92} r={1.6} fill="#ffb86b" />
        <circle cx={62} cy={94} r={1.6} fill="#ffb86b" />
        <circle cx={82} cy={86} r={1.4} fill="#ffe066" />
      </svg>
      <div style={{ fontWeight: 700, fontSize: size * 0.62, lineHeight: 1.02, letterSpacing: -1, textAlign: "left" }}>
        <div style={{ color: colors.text }}>SABOTE</div>
        <div style={{ color: colors.accent }}>TRIS</div>
      </div>
    </div>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pop = interpolate(frame, [0, 22], [0, 1], {
    easing: Easing.out(Easing.back(1.4)),
    extrapolateRight: "clamp",
  });
  const tag = interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - XFADE, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ transform: `scale(${0.8 + 0.2 * pop})`, opacity: pop }}>
        <Logo size={200} />
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 40,
          color: colors.muted,
          opacity: tag,
          transform: `translateY(${(1 - tag) * 14}px)`,
        }}
      >
        The pieces are fighting back.
      </div>
    </AbsoluteFill>
  );
};

const GAME_SCALE = 1.3; // 540x700 recording -> 702x910
const Game: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const opacity = useFade(durationInFrames);
  const w = 540 * GAME_SCALE;
  const h = 700 * GAME_SCALE;
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: "absolute", left: 130, top: 130 }}>
        <Caption trim={DESKTOP_TRIM} chapters={desktopChapters} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 460, height: 130 }}>
        <EventChip trim={DESKTOP_TRIM} chips={desktopChips} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 680 }}>
        <KeyHud trim={DESKTOP_TRIM} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1130,
          top: (1080 - h) / 2,
          width: w,
          height: h,
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.1)",
        }}
      >
        <OffthreadVideo
          src={staticFile("desktop.mp4")}
          trimBefore={Math.round(DESKTOP_TRIM * FPS)}
          muted
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Phone: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const opacity = useFade(durationInFrames);
  const PS = 1.15; // 412x760 recording -> 474x874
  const w = Math.round(412 * PS);
  const h = Math.round(760 * PS);
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: "absolute", left: 130, top: 130 }}>
        <Caption trim={PHONE_TRIM} chapters={phoneChapters} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 460, height: 130 }}>
        <EventChip trim={PHONE_TRIM} chips={phoneChips} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 700 }}>
        <GestureHud trim={PHONE_TRIM} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1244,
          top: (1080 - h) / 2,
          width: w,
          height: h,
          borderRadius: 46,
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,.7), 0 0 0 10px #1b2430, 0 0 0 11px rgba(255,255,255,.12)",
        }}
      >
        <OffthreadVideo
          src={staticFile("phone.mp4")}
          trimBefore={Math.round(PHONE_TRIM * FPS)}
          muted
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = useFade(durationInFrames, XFADE, 0);
  const rise = interpolate(frame, [0, 24], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: "clamp",
  });
  const pill = (text: string) => (
    <div
      style={{
        padding: "12px 26px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 28,
        background: "rgba(255,255,255,.03)",
      }}
    >
      {text}
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>
      <div style={{ transform: `translateY(${(1 - rise) * 20}px)`, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Logo size={130} />
        </div>
        <div style={{ marginTop: 40, display: "flex", gap: 16, justifyContent: "center" }}>
          {pill("12 chaos effects")}
          {pill("Global leaderboards")}
          {pill("Desktop and mobile")}
        </div>
        <div style={{ marginTop: 44, fontSize: 34, color: colors.blue }}>paablobs.github.io/sabotetris</div>
        <div style={{ marginTop: 10, fontSize: 24, color: colors.muted }}>github.com/paablobs/sabotetris</div>
      </div>
    </AbsoluteFill>
  );
};

export const SabotetrisDemo: React.FC = () => {
  const d1 = INTRO - XFADE;
  const d2 = d1 + DESKTOP_LEN - XFADE;
  const d3 = d2 + PHONE_LEN - XFADE;
  return (
    <AbsoluteFill style={{ fontFamily, background: colors.bg }}>
      <Background />
      <Sequence from={0} durationInFrames={INTRO}>
        <Intro />
      </Sequence>
      <Sequence from={d1} durationInFrames={DESKTOP_LEN}>
        <Game />
      </Sequence>
      <Sequence from={d2} durationInFrames={PHONE_LEN}>
        <Phone />
      </Sequence>
      <Sequence from={d3} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

import { loadFont } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// Palette taken from the game itself (src/engine/scenes, src/engine/actors).
export const colors = {
  bg: "#0d0d1a",
  bgAlt: "#1a1a2e",
  panel: "#16213e",
  border: "#2a3a5c",
  text: "#ddeeff",
  muted: "#8899aa",
  dim: "#667788",
  accent: "#ff4d6d", // sabotage red
  blue: "#4dd0ff",
  purple: "#b86bff",
  green: "#88cc88",
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

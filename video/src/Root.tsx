import React from "react";
import { Composition } from "remotion";
import { SabotetrisDemo, TOTAL_FRAMES } from "./Video";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const Root: React.FC = () => (
  <Composition
    id="SabotetrisDemo"
    component={SabotetrisDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);

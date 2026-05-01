/**
 * Remotion Studio：验收 T5.4 `BlockComposition`（动态块 + 字幕在 `enterFrames` 后起算 + 音频延后）。
 * 仓库根目录：`npx remotion studio remotion/studio-block-composition.tsx`
 */
import React from "react";
import { Composition, registerRoot } from "remotion";
import "./engine/theme.js";
import { blockLoaders } from "./studio-block-imports.js";
import { BlockComposition } from "./VideoComposition.js";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const ENTER_FRAMES = Math.round(0.5 * FPS);
const EXIT_FRAMES = Math.round(0.3 * FPS);
/** 与 `public/script.json` 中 `audio.durationSec: 8` 及 §9 默认一致 */
const DEMO_AUDIO_SEC = 8;
const MIN_HOLD_SEC = 1.5;
const HOLD_FRAMES = Math.max(
  1,
  Math.round(Math.max(DEMO_AUDIO_SEC, MIN_HOLD_SEC) * FPS),
);
const durationInFrames = ENTER_FRAMES + HOLD_FRAMES + EXIT_FRAMES;

function BlockCompositionStudioDemo() {
  return (
    <BlockComposition blockId="B01" blockLoaders={blockLoaders} scriptPublicPath="script.json" />
  );
}

export const StudioBlockCompositionRoot = () => (
  <Composition
    id="BlockCompositionB01Demo"
    component={BlockCompositionStudioDemo}
    durationInFrames={durationInFrames}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{}}
  />
);

registerRoot(StudioBlockCompositionRoot);

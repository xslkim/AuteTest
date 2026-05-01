/** Remotion Studio：验收 T5.3 BlockFrame fade-up（自下方滑入 + 渐显）。`npx remotion studio remotion/studio-block-frame.tsx` */
import React from "react";
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "remotion";
import "./engine/theme.js";
import { getTheme } from "./engine/theme.js";
import { BlockFrame } from "./engine/block-frame.js";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
/** 与 §9 `render.defaultEnterSec` / `defaultExitSec` 默认一致：0.5s / 0.3s */
const ENTER_FRAMES = Math.round(0.5 * FPS);
const EXIT_FRAMES = Math.round(0.3 * FPS);
const HOLD_FRAMES = 90;
const durationInFrames = ENTER_FRAMES + HOLD_FRAMES + EXIT_FRAMES;
const subtitleSafeBottom = Math.floor(HEIGHT * 0.15);

function FadeUpBlockDemoInner() {
  const frame = useCurrentFrame();
  const theme = getTheme("dark-code");
  const audioFrame = frame - ENTER_FRAMES;

  return (
    <BlockFrame
      enter="fade-up"
      exit="fade"
      enterFrames={ENTER_FRAMES}
      exitFrames={EXIT_FRAMES}
      durationInFrames={durationInFrames}
      fps={FPS}
    >
      <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: 48,
              borderRadius: 16,
              backgroundColor: theme.colors.code.bg,
              color: theme.colors.fg,
              fontFamily: theme.fonts.sans,
              fontSize: 56,
            }}
          >
            fade-up 内容区
          </div>
        </AbsoluteFill>
        {audioFrame >= 0 ? (
          <AbsoluteFill
            style={{
              bottom: subtitleSafeBottom * 1.2,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: theme.colors.muted,
                fontFamily: theme.fonts.sans,
                fontSize: 28,
              }}
            >
              入场结束后的帧：{audioFrame}（字幕层将来由 SubtitleOverlay 提供）
            </span>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>
    </BlockFrame>
  );
}

export const StudioBlockFrameRoot = () => (
  <Composition
    id="BlockFrameFadeUpDemo"
    component={FadeUpBlockDemoInner}
    durationInFrames={durationInFrames}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);

registerRoot(StudioBlockFrameRoot);

/** Remotion Studio 入口：验收 T5.2 字幕按时序与高亮切换（`npx remotion studio remotion/studio-subtitle-overlay.tsx`）。 */
import React from "react";
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "remotion";
import "./engine/theme.js";
import { SubtitleOverlay } from "./components/SubtitleOverlay.js";
import { getTheme } from "./engine/theme.js";
import type { NarrationLine } from "../src/types/script.js";

const DEMO_FPS = 30;
const DEMO_WIDTH = 1920;
const DEMO_HEIGHT = 1080;

const DEMO_LINES: NarrationLine[] = [
  {
    text: "第一段 **高亮甲**",
    ttsText: "第一段 高亮甲",
    highlights: [{ start: 4, end: 7 }],
  },
  {
    text: "第二段有 **两处** **强调**",
    ttsText: "第二段有两处强调",
    highlights: [
      { start: 4, end: 6 },
      { start: 6, end: 8 },
    ],
  },
  {
    text: "**整段加粗** 也可以",
    ttsText: "整段加粗也可以",
    highlights: [{ start: 0, end: 4 }],
  },
];

/** 与 tests/tts-timings.test.ts 一致：行 0 至 1000ms，200ms 间隙，行 1 自 1200ms，行 2 自 1900ms（示例 endMs 取整段末）。 */
const DEMO_LINE_TIMINGS = [
  { lineIndex: 0, startMs: 0, endMs: 1000 },
  { lineIndex: 1, startMs: 1200, endMs: 1700 },
  { lineIndex: 2, startMs: 1900, endMs: 3900 },
] as const;

const AUDIO_START_FRAMES = 15;
const durationInFrames = AUDIO_START_FRAMES + Math.ceil((4000 / 1000) * DEMO_FPS);

function SubtitleOverlayDemo() {
  const frame = useCurrentFrame();
  const theme = getTheme("dark-code");

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <SubtitleOverlay
        lines={DEMO_LINES}
        lineTimings={[
          ...DEMO_LINE_TIMINGS.map((t) => ({ ...t })),
        ]}
        audioStartFrame={AUDIO_START_FRAMES}
        frame={frame}
        fps={DEMO_FPS}
        width={DEMO_WIDTH}
        height={DEMO_HEIGHT}
        theme={theme}
      />
    </AbsoluteFill>
  );
}

export const StudioSubtitleOverlayRoot = () => (
  <Composition
    id="SubtitleOverlayDemo"
    component={SubtitleOverlayDemo}
    durationInFrames={durationInFrames}
    fps={DEMO_FPS}
    width={DEMO_WIDTH}
    height={DEMO_HEIGHT}
  />
);

registerRoot(StudioSubtitleOverlayRoot);

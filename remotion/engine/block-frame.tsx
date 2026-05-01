import type { CSSProperties, JSX } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { BlockFrameProps } from "../../src/types/script.js";
import { getAnimationStyle } from "./animations.js";

function phaseProgress(
  frame: number,
  enterFrames: number,
  exitFrames: number,
  durationInFrames: number,
): { kind: "enter" | "hold" | "exit"; t: number } {
  if (enterFrames > 0 && frame < enterFrames) {
    return { kind: "enter", t: frame / enterFrames };
  }

  const exitStart = durationInFrames - exitFrames;
  if (exitFrames > 0 && frame >= exitStart) {
    const local = (frame - exitStart) / exitFrames;
    return { kind: "exit", t: local };
  }

  return { kind: "hold", t: 0 };
}

/**
 * 块外壳：入场 / 保持 / 出场三阶段；出场对同一 preset 使用 `1 - localProgress`，与入场对称（fade、位移、缩放一致）。
 */
export function BlockFrame(props: BlockFrameProps): JSX.Element {
  const {
    enter,
    exit,
    enterFrames,
    exitFrames,
    durationInFrames,
    children,
  } = props;

  const frame = useCurrentFrame();
  const enterFn = getAnimationStyle(enter);
  const exitFn = getAnimationStyle(exit);

  const phase = phaseProgress(frame, enterFrames, exitFrames, durationInFrames);

  let style: CSSProperties = {};
  if (phase.kind === "enter") {
    style = enterFn(phase.t);
  } else if (phase.kind === "exit") {
    style = exitFn(1 - phase.t);
  }

  return (
    <AbsoluteFill style={style}>
      {children}
    </AbsoluteFill>
  );
}

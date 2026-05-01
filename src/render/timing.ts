import type { AnimationPreset, Block } from "../types/script.js";

/** §6.4 step 1 — `render` 段配置中与 timing 相关的字段 + `meta.fps` */
export interface TimingComputationParams {
  fps: number;
  minHoldSec: number;
  defaultEnterSec: number;
  defaultExitSec: number;
}

export type BlockTiming = NonNullable<Block["timing"]>;

function presetSec(preset: AnimationPreset, defaultSec: number): number {
  return preset === "none" ? 0 : defaultSec;
}

/**
 * 计算单块 `timing`（§6.4 step 1）。
 * 帧数与 `VideoComposition` 无 `timing` 时的 fallback 一致：`hold` 至少 1 帧。
 */
export function computeBlockTiming(
  block: Pick<Block, "enter" | "exit" | "narration" | "audio">,
  params: TimingComputationParams,
): BlockTiming {
  const { fps, minHoldSec, defaultEnterSec, defaultExitSec } = params;

  const enterSec = presetSec(block.enter, defaultEnterSec);
  const exitSec = presetSec(block.exit, defaultExitSec);

  const holdSec = Math.max(
    block.audio?.durationSec ?? 0,
    block.narration.explicitDurationSec ?? 0,
    minHoldSec,
  );

  const enterFrames = Math.round(enterSec * fps);
  const exitFrames = Math.round(exitSec * fps);
  const holdFrames = Math.max(1, Math.round(holdSec * fps));
  const frames = enterFrames + holdFrames + exitFrames;
  const totalSec = frames / fps;

  return {
    enterSec,
    holdSec,
    exitSec,
    totalSec,
    frames,
    enterFrames,
  };
}

/** 就地写回每块的 `block.timing`（突变 `blocks`）。 */
export function applyTimingsToBlocks(
  blocks: Block[],
  params: TimingComputationParams,
): void {
  for (const block of blocks) {
    block.timing = computeBlockTiming(block, params);
  }
}

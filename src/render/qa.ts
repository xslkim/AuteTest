import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import type { Block } from "../types/script.js";

function assertFfprobeOk(result: ReturnType<typeof spawnSync>, label: string): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`${label} exited ${status}${err ? `: ${err}` : ""}`);
}

function assertFfmpegOk(result: ReturnType<typeof spawnSync>, label: string): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`${label} exited ${status}${err ? `: ${err}` : ""}`);
}

function ffprobeFormatDurationSec(videoPathAbs: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPathAbs,
    ],
    { encoding: "utf-8" },
  );
  assertFfprobeOk(result, "ffprobe format duration");
  const raw = result.stdout.trim();
  const sec = Number.parseFloat(raw);
  if (!Number.isFinite(sec)) {
    throw new Error(`ffprobe: invalid duration for ${videoPathAbs}: ${raw}`);
  }
  return sec;
}

function ffprobeVideoWidthHeight(videoPathAbs: string): { width: number; height: number } {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      videoPathAbs,
    ],
    { encoding: "utf-8" },
  );
  assertFfprobeOk(result, "ffprobe video size");
  const parts = result.stdout.trim().split(",");
  if (parts.length < 2) {
    throw new Error(`ffprobe: could not read width,height for ${videoPathAbs}`);
  }
  const width = Number.parseInt(parts[0]!, 10);
  const height = Number.parseInt(parts[1]!, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`ffprobe: invalid width/height for ${videoPathAbs}: ${result.stdout.trim()}`);
  }
  return { width, height };
}

function extractRgb24Frame(videoPathAbs: string, timeSec: number, width: number, height: number): Buffer {
  const expectedBytes = width * height * 3;
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-ss",
      String(timeSec),
      "-i",
      videoPathAbs,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer", maxBuffer: Math.max(32 * 1024 * 1024, expectedBytes + 1) },
  );
  assertFfmpegOk(result, "ffmpeg extract rgb24 frame");
  const buf = result.stdout;
  if (buf.length < expectedBytes) {
    throw new Error(
      `ffmpeg: expected ${expectedBytes} bytes of RGB24 (${width}×${height}), got ${buf.length} at t=${timeSec}s`,
    );
  }
  return buf.subarray(0, expectedBytes);
}

function isPureBlackRgb24(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

/** Σ(block.timing.frames) / fps — PRD §6.4 step 8 / T6.6. */
export function expectedFinalDurationSecFromBlocks(blocks: readonly Block[], fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`QA: invalid fps: ${fps}`);
  }
  let totalFrames = 0;
  for (const b of blocks) {
    const frames = b.timing?.frames;
    if (frames == null) {
      throw new Error(`QA: block ${b.id} is missing timing.frames (sum partial durations)`);
    }
    if (!Number.isFinite(frames) || frames < 1) {
      throw new Error(`QA: block ${b.id} has invalid timing.frames: ${frames}`);
    }
    totalFrames += frames;
  }
  return totalFrames / fps;
}

export interface ValidateFinalNormalizedOptions {
  finalPathAbs: string;
  /** Expected from `script.meta.width` / `meta.height`. */
  width: number;
  height: number;
  fps: number;
  blocks: readonly Block[];
}

/**
 * PRD §6.4 step 8 / T6.6 — resolution, duration vs Σ partial (±1 frame), 5 interior sample frames not pure black.
 */
export function validateFinalNormalizedVideo(options: ValidateFinalNormalizedOptions): void {
  const { finalPathAbs, width, height, fps, blocks } = options;
  if (!existsSync(finalPathAbs)) {
    throw new Error(`QA: file not found: ${finalPathAbs}`);
  }

  const { width: vw, height: vh } = ffprobeVideoWidthHeight(finalPathAbs);
  if (vw !== width || vh !== height) {
    throw new Error(
      `QA: resolution mismatch — expected ${width}×${height}, final is ${vw}×${vh} (${finalPathAbs})`,
    );
  }

  const expectedDur = expectedFinalDurationSecFromBlocks(blocks, fps);
  const actualDur = ffprobeFormatDurationSec(finalPathAbs);
  const frameSec = 1 / fps;
  if (Math.abs(actualDur - expectedDur) > frameSec + 1e-5) {
    throw new Error(
      [
        `QA: duration mismatch — expected Σ partial ≈ ${expectedDur.toFixed(6)}s (±1/${fps}s),`,
        `ffprobe reports ${actualDur.toFixed(6)}s (${finalPathAbs})`,
      ].join(" "),
    );
  }

  if (actualDur <= 0) {
    throw new Error(`QA: non-positive duration ${actualDur} (${finalPathAbs})`);
  }

  for (let i = 0; i < 5; i++) {
    const t = (actualDur * (i + 0.5)) / 5;
    const rgb = extractRgb24Frame(finalPathAbs, t, vw, vh);
    if (isPureBlackRgb24(rgb)) {
      throw new Error(
        `QA: equidistant sample ${i + 1}/5 at t=${t.toFixed(6)}s is pure black (${finalPathAbs})`,
      );
    }
  }
}

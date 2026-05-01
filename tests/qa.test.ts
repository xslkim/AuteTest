import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  expectedFinalDurationSecFromBlocks,
  validateFinalNormalizedVideo,
} from "../src/render/qa.js";
import type { Block } from "../src/types/script.js";

function assertFfmpegOk(result: ReturnType<typeof spawnSync>, label: string): void {
  const status = result.status ?? 1;
  if (status !== 0) {
    throw new Error(
      `${label} failed (${status}): ${result.stderr?.toString()?.trim() || result.stdout?.toString()?.trim() || ""}`,
    );
  }
}

/** All-black H.264 + AAC @ 640×480, 30 fps, ~2s — QA must reject (5 samples are black). */
function encodeBlackMp4(outPath: string): void {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=640x480:r=30",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-shortest",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
  );
  assertFfmpegOk(r, "ffmpeg encode black mp4");
}

/** Test pattern — non-black samples. */
function encodeTestPatternMp4(outPath: string, durationSec: string): void {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=640x480:rate=30`,
      "-f",
      "lavfi",
      "-i",
      "aevalsrc='0.2*sin(2*PI*440*t)|0.2*sin(2*PI*440*t)':sample_rate=48000",
      "-shortest",
      "-t",
      durationSec,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
  );
  assertFfmpegOk(r, "ffmpeg encode testpattern mp4");
}

describe("qa / validateFinalNormalizedVideo", () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (tmp != null) {
      rmSync(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it("rejects an all-black mp4 (sample frames are pure black)", () => {
    tmp = mkdtempSync(join(tmpdir(), "autovideo-qa-"));
    const mp4 = join(tmp, "black.mp4");
    encodeBlackMp4(mp4);

    const blocks: Block[] = [
      {
        id: "B01",
        title: "t",
        enter: "fade",
        exit: "fade",
        visual: { description: "" },
        narration: { lines: [] },
        timing: {
          enterSec: 0,
          holdSec: 2,
          exitSec: 0,
          totalSec: 2,
          frames: 60,
          enterFrames: 0,
        },
      },
    ];

    expect(() =>
      validateFinalNormalizedVideo({
        finalPathAbs: mp4,
        width: 640,
        height: 480,
        fps: 30,
        blocks,
      }),
    ).toThrow(/pure black/i);
  });

  it("passes for a test pattern with duration matching Σ frames/fps", () => {
    tmp = mkdtempSync(join(tmpdir(), "autovideo-qa-"));
    const mp4 = join(tmp, "ok.mp4");
    encodeTestPatternMp4(mp4, "2");

    const blocks: Block[] = [
      {
        id: "B01",
        title: "t",
        enter: "fade",
        exit: "fade",
        visual: { description: "" },
        narration: { lines: [] },
        timing: {
          enterSec: 0,
          holdSec: 2,
          exitSec: 0,
          totalSec: 2,
          frames: 60,
          enterFrames: 0,
        },
      },
    ];

    expect(() =>
      validateFinalNormalizedVideo({
        finalPathAbs: mp4,
        width: 640,
        height: 480,
        fps: 30,
        blocks,
      }),
    ).not.toThrow();
  });

  it("expectedFinalDurationSecFromBlocks sums timing.frames / fps", () => {
    const blocks: Block[] = [
      {
        id: "B01",
        title: "a",
        enter: "fade",
        exit: "fade",
        visual: { description: "" },
        narration: { lines: [] },
        timing: {
          enterSec: 0,
          holdSec: 1,
          exitSec: 0,
          totalSec: 1,
          frames: 30,
          enterFrames: 0,
        },
      },
      {
        id: "B02",
        title: "b",
        enter: "fade",
        exit: "fade",
        visual: { description: "" },
        narration: { lines: [] },
        timing: {
          enterSec: 0,
          holdSec: 1,
          exitSec: 0,
          totalSec: 1,
          frames: 45,
          enterFrames: 0,
        },
      },
    ];
    expect(expectedFinalDurationSecFromBlocks(blocks, 30)).toBe(2.5);
  });
});

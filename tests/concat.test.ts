import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterAll } from "vitest";

import { DEFAULT_RENDER } from "../src/config/defaults.js";
import { concatPartials, validatePartials } from "../src/render/concat.js";
import {
  normalizeFinalWithLoudnorm,
  probeIntegratedLoudnessLufs,
} from "../src/render/loudnorm.js";

function assertFfmpegOk(result: ReturnType<typeof spawnSync>, label: string): void {
  const status = result.status ?? 1;
  if (status !== 0) {
    throw new Error(
      `${label} failed (${status}): ${result.stderr?.toString()?.trim() || result.stdout?.toString()?.trim() || ""}`,
    );
  }
}

/** ~1s 640×480 test pattern + AAC stereo — Remotion-ish layout for concat parity tests. */
function encodeTestPartial(outPath: string, size: `${number}x${number}`, label: string): void {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${size}:rate=30`,
      "-f",
      "lavfi",
      "-i",
      "aevalsrc='0.2*sin(2*PI*440*t)|0.2*sin(2*PI*440*t)':sample_rate=48000",
      "-shortest",
      "-t",
      "1",
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
  assertFfmpegOk(r, `ffmpeg encode ${label}`);
}

function probeDuration(videoPath: string): number {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      videoPath,
    ],
    { encoding: "utf-8" },
  );
  assertFfmpegOk(r, "ffprobe duration");
  const sec = Number.parseFloat(r.stdout.trim());
  if (!Number.isFinite(sec)) {
    throw new Error(`bad duration for ${videoPath}`);
  }
  return sec;
}

describe("concatPartials / validatePartials", () => {
  const base = mkdtempSync(join(tmpdir(), "av-concat-unit-"));

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("validatePartials: two matching partials returns signature", () => {
    const a = join(base, "m-a.mp4");
    const b = join(base, "m-b.mp4");
    encodeTestPartial(a, "640x480", "match-a");
    encodeTestPartial(b, "640x480", "match-b");

    const sig = validatePartials([a, b]);
    expect(sig.videoCodec).toBe("h264");
    expect(sig.width).toBe(640);
    expect(sig.height).toBe(480);
    expect(sig.pixFmt).toBe("yuv420p");
    expect(sig.avgFrameRate).toBe("30/1");
    expect(sig.audioCodec).toContain("aac");
  });

  it("validatePartials: rejects resolution mismatch", () => {
    const a = join(base, "x-a.mp4");
    const small = join(base, "x-small.mp4");
    encodeTestPartial(a, "640x480", "x-a");
    encodeTestPartial(small, "320x240", "x-small");

    expect(() => validatePartials([a, small])).toThrow(/mismatch/i);
    expect(() => validatePartials([a, small])).toThrow(/autovideo cache clean --type partial/);
  });

  it("concatPartials writes output/concat.txt + final.mp4; duration sums partials", async () => {
    const buildOut = join(base, "build-out-concat");
    const partialDir = join(buildOut, "output", "partials");
    rmSync(buildOut, { recursive: true, force: true });
    mkdirSync(partialDir, { recursive: true });

    encodeTestPartial(join(partialDir, "p1.mp4"), "640x480", "c1");
    encodeTestPartial(join(partialDir, "p2.mp4"), "640x480", "c2");

    const p1 = join(partialDir, "p1.mp4");
    const p2 = join(partialDir, "p2.mp4");
    const d1 = probeDuration(p1);
    const d2 = probeDuration(p2);

    await concatPartials({
      partialPathsAbs: [p1, p2],
      buildOutDirAbs: buildOut,
    });

    expect(existsSync(join(buildOut, "output", "concat.txt"))).toBe(true);
    const finalPath = join(buildOut, "output", "final.mp4");
    expect(existsSync(finalPath)).toBe(true);

    const total = probeDuration(finalPath);
    expect(Math.abs(total - (d1 + d2))).toBeLessThan(0.08);

    const warnProbe = spawnSync(
      "ffmpeg",
      ["-nostats", "-v", "warning", "-i", finalPath, "-f", "null", "-"],
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
    assertFfmpegOk(warnProbe, "ffmpeg replay final");
    const log = warnProbe.stderr.toLowerCase();
    expect(log).not.toMatch(/non-monotonic dts|invalid timestamps|dts < 0/);

    const normPath = join(buildOut, "output", "final_normalized.mp4");
    await normalizeFinalWithLoudnorm({
      finalPathAbs: finalPath,
      outputPathAbs: normPath,
      loudnorm: DEFAULT_RENDER.loudnorm,
    });
    expect(existsSync(normPath)).toBe(true);
    const lufs = probeIntegratedLoudnessLufs(normPath, DEFAULT_RENDER.loudnorm);
    expect(Math.abs(lufs - DEFAULT_RENDER.loudnorm.i)).toBeLessThanOrEqual(0.5);
  });
});

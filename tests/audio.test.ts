import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { appendSilence, concatWavs, wavDurationSec } from "../src/tts/audio.js";

function assertToolOk(tool: string, result: ReturnType<typeof spawnSync>): void {
  expect(result.status, `${tool} stderr: ${result.stderr?.toString()}`).toBe(0);
}

function wavFromLavfi(durationSec: number, sampleRate = 48000): Buffer {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${sampleRate}:cl=mono`,
      "-t",
      String(durationSec),
      "-acodec",
      "pcm_s16le",
      "-f",
      "wav",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  assertToolOk("ffmpeg", r);
  return r.stdout as Buffer;
}

describe("ffmpeg audio helpers", () => {
  const dir = mkdtempSync(join(tmpdir(), "av-audio-test-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appendSilence: 1s + 200ms → ffprobe duration ≈ 1.2s (±1ms)", () => {
    const oneSec = wavFromLavfi(1);
    const out = appendSilence(oneSec, 200);
    const outPath = join(dir, "one-plus-gap.wav");
    writeFileSync(outPath, out);
    const dur = wavDurationSec(outPath);
    expect(dur).toBeGreaterThanOrEqual(1.199);
    expect(dur).toBeLessThanOrEqual(1.201);
  });

  it("concatWavs: 0.5s + 0.5s ≈ 1.0s", () => {
    const a = wavFromLavfi(0.5);
    const b = wavFromLavfi(0.5);
    const merged = concatWavs([a, b]);
    const outPath = join(dir, "merged.wav");
    writeFileSync(outPath, merged);
    const dur = wavDurationSec(outPath);
    expect(dur).toBeGreaterThanOrEqual(0.999);
    expect(dur).toBeLessThanOrEqual(1.001);
  });

  it("wavDurationSec throws when file missing", () => {
    expect(() => wavDurationSec(join(dir, "nope.wav"))).toThrow(/not found/);
  });

  it("concatWavs throws on empty", () => {
    expect(() => concatWavs([])).toThrow(/at least one buffer/);
  });
});

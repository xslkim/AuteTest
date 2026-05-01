import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  computeVoiceRefHash,
  computeVoxcpmModelVersion,
  ttsAudioCacheKey,
} from "../src/tts/cache-key.js";

describe("tts cache key helpers", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("computeVoiceRefHash 为整文件 MD5 hex", () => {
    dir = mkdtempSync(join(tmpdir(), "av-tts-key-"));
    const p = join(dir, "v.wav");
    writeFileSync(p, Buffer.from("abc"));
    const h = computeVoiceRefHash(p);
    expect(h).toMatch(/^[a-f0-9]{32}$/);
  });

  it("computeVoxcpmModelVersion：优先 config.json", () => {
    dir = mkdtempSync(join(tmpdir(), "av-tts-model-"));
    writeFileSync(join(dir, "config.json"), '{"x":1}', "utf8");
    const v = computeVoxcpmModelVersion(dir);
    expect(v.length).toBe(32);
  });

  it("ttsAudioCacheKey 随 ttsText 变化", () => {
    const base = {
      voiceRefHash: "vh",
      cfgValue: 2,
      inferenceTimesteps: 10,
      denoise: false,
      voxcpmModelVersion: "mv",
    };
    const a = ttsAudioCacheKey({ ...base, ttsText: "a" });
    const b = ttsAudioCacheKey({ ...base, ttsText: "b" });
    expect(a).not.toBe(b);
  });
});

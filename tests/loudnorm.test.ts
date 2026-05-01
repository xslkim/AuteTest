import { describe, expect, it } from "vitest";

import type { LoudnormSection } from "../src/config/types.js";
import {
  extractLastJsonObject,
  parseLoudnormMeasureJson,
} from "../src/render/loudnorm.js";

const sampleJsonBlock = `{
	"input_i" : "-21.75",
	"input_tp" : "-17.69",
	"input_lra" : "0.00",
	"input_thresh" : "-31.75",
	"output_i" : "-16.05",
	"output_tp" : "-11.94",
	"output_lra" : "0.00",
	"output_thresh" : "-26.05",
	"normalization_type" : "linear",
	"target_offset" : "0.05"
}`;

describe("loudnorm JSON parse", () => {
  it("extractLastJsonObject ignores trailing noise", () => {
    const stderr = `ffmpeg version...\n${sampleJsonBlock}\n[out#0] done`;
    const raw = extractLastJsonObject(stderr);
    expect(JSON.parse(raw).input_i).toBe("-21.75");
  });

  it("parseLoudnormMeasureJson maps input_* → measured_* + offset", () => {
    const m = parseLoudnormMeasureJson(`noise\n${sampleJsonBlock}`);
    expect(m).toEqual({
      measuredI: "-21.75",
      measuredTp: "-17.69",
      measuredLra: "0.00",
      measuredThresh: "-31.75",
      offset: "0.05",
    });
  });

  it("parseLoudnormMeasureJson throws on incomplete JSON", () => {
    expect(() => parseLoudnormMeasureJson('{"input_i":"-10"}')).toThrow(/missing measured fields/);
  });
});

describe("normalizeFinalWithLoudnorm twoPass: false", () => {
  it("copies input to output when paths differ", async () => {
    const { writeFileSync, readFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { normalizeFinalWithLoudnorm } = await import("../src/render/loudnorm.js");

    const dir = mkdtempSync(join(tmpdir(), "av-ln-copy-"));
    try {
      const src = join(dir, "in.mp4");
      const dst = join(dir, "out.mp4");
      writeFileSync(src, "fake-mp4-bytes");
      const cfg: LoudnormSection = {
        i: -16,
        tp: -1.5,
        lra: 11,
        twoPass: false,
        audioBitrate: "192k",
      };
      await normalizeFinalWithLoudnorm({
        finalPathAbs: src,
        outputPathAbs: dst,
        loudnorm: cfg,
      });
      expect(readFileSync(dst, "utf8")).toBe("fake-mp4-bytes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import { computeBlockTiming } from "../src/render/timing.js";
import type { Block } from "../src/types/script.js";

describe("computeBlockTiming", () => {
  it("fade-up enter + 3s audio hold + fade exit @ 30fps → 114 frames (TASKS T6.2)", () => {
    const block: Pick<Block, "enter" | "exit" | "narration" | "audio"> = {
      enter: "fade-up",
      exit: "fade",
      narration: { lines: [] },
      audio: {
        wavPath: "public/audio/B01.wav",
        durationSec: 3,
        lineTimings: [],
      },
    };

    const timing = computeBlockTiming(block, {
      fps: 30,
      minHoldSec: 1.5,
      defaultEnterSec: 0.5,
      defaultExitSec: 0.3,
    });

    expect(timing.enterSec).toBe(0.5);
    expect(timing.holdSec).toBe(3);
    expect(timing.exitSec).toBe(0.3);
    expect(timing.enterFrames).toBe(15);
    expect(timing.frames).toBe(114);
    expect(timing.totalSec).toBeCloseTo(114 / 30, 10);
  });

  it("none presets → zero enter/exit seconds and frames", () => {
    const block: Pick<Block, "enter" | "exit" | "narration" | "audio"> = {
      enter: "none",
      exit: "none",
      narration: { lines: [] },
      audio: { wavPath: "x", durationSec: 2, lineTimings: [] },
    };

    const timing = computeBlockTiming(block, {
      fps: 30,
      minHoldSec: 1.5,
      defaultEnterSec: 0.5,
      defaultExitSec: 0.3,
    });

    expect(timing.enterSec).toBe(0);
    expect(timing.exitSec).toBe(0);
    expect(timing.enterFrames).toBe(0);
    expect(timing.frames).toBe(Math.round(2 * 30));
  });

  it("respects explicit duration when louder than audio and min hold", () => {
    const block: Pick<Block, "enter" | "exit" | "narration" | "audio"> = {
      enter: "fade",
      exit: "fade",
      narration: { lines: [], explicitDurationSec: 10 },
      audio: { wavPath: "x", durationSec: 1, lineTimings: [] },
    };

    const timing = computeBlockTiming(block, {
      fps: 30,
      minHoldSec: 1.5,
      defaultEnterSec: 0.5,
      defaultExitSec: 0.3,
    });

    expect(timing.holdSec).toBe(10);
    expect(timing.frames).toBe(
      Math.round(0.5 * 30) + Math.round(10 * 30) + Math.round(0.3 * 30),
    );
  });
});

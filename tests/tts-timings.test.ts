import { describe, expect, it } from "vitest";

import {
  LINE_TAIL_SILENCE_MS,
  computeLineTimings,
} from "../src/tts/timings.js";

describe("computeLineTimings", () => {
  it("matches PRD §6.2.3 for [1.0s, 0.5s, 2.0s]", () => {
    expect(computeLineTimings([1.0, 0.5, 2.0])).toEqual([
      { lineIndex: 0, startMs: 0, endMs: 1000 },
      { lineIndex: 1, startMs: 1200, endMs: 1700 },
      { lineIndex: 2, startMs: 1900, endMs: 3900 },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(computeLineTimings([])).toEqual([]);
  });

  it("single line starts at 0", () => {
    expect(computeLineTimings([2.25])).toEqual([
      { lineIndex: 0, startMs: 0, endMs: 2250 },
    ]);
  });

  it("rejects negative or non-finite duration", () => {
    expect(() => computeLineTimings([-0.01])).toThrow(/non-negative/);
    expect(() => computeLineTimings([NaN])).toThrow(/finite/);
  });
});

describe("LINE_TAIL_SILENCE_MS", () => {
  it("is 200 per PRD §3.7 / §6.2.3", () => {
    expect(LINE_TAIL_SILENCE_MS).toBe(200);
  });
});

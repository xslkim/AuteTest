import { describe, expect, it } from "vitest";
import type { Block } from "../src/types/script.js";
import {
  previewCompositionDurationFrames,
  uniformLineTimingsForPreview,
} from "../remotion/VideoComposition.js";

describe("previewCompositionDurationFrames", () => {
  it("matches fallback timing without block.timing", () => {
    const block = {
      id: "B01",
      enter: "fade",
      exit: "fade",
      narration: { lines: [{ text: "x", ttsText: "x", highlights: [] }] },
    } as unknown as Block;

    expect(previewCompositionDurationFrames(block, 30)).toBe(69);
  });
});

describe("uniformLineTimingsForPreview", () => {
  it("splits hold evenly across lines", () => {
    expect(uniformLineTimingsForPreview(2, 3000)).toEqual([
      { lineIndex: 0, startMs: 0, endMs: 1500 },
      { lineIndex: 1, startMs: 1500, endMs: 3000 },
    ]);
  });

  it("returns empty for zero lines", () => {
    expect(uniformLineTimingsForPreview(0, 1000)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { parseNarrationLine, parseNarrationLines } from "../src/parser/narration.js";

describe("parseNarrationLine", () => {
  it("TASK acceptance: hello **world**", () => {
    const r = parseNarrationLine("hello **world**");
    expect(r.text).toBe("hello **world**");
    expect(r.ttsText).toBe("hello world");
    expect(r.highlights).toEqual([{ start: 6, end: 11 }]);
  });

  it("TASK acceptance: \\*\\*ptr → literal **ptr, no highlights", () => {
    const r = parseNarrationLine("\\*\\*ptr");
    expect(r.text).toBe("**ptr");
    expect(r.ttsText).toBe("**ptr");
    expect(r.highlights).toEqual([]);
  });

  it("multiple highlights", () => {
    const r = parseNarrationLine("a **b** c **d**");
    expect(r.ttsText).toBe("a b c d");
    expect(r.highlights).toEqual([
      { start: 2, end: 3 },
      { start: 6, end: 7 },
    ]);
  });

  it("non-greedy sequential pairs (nested-like input)", () => {
    const r = parseNarrationLine("**a **b** c**");
    expect(r.text).toBe("**a **b** c**");
    expect(r.ttsText).toBe("a b c");
    expect(r.highlights).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it("empty bold produces no highlight span", () => {
    const r = parseNarrationLine("x **** y");
    expect(r.text).toBe("x **** y");
    expect(r.ttsText).toBe("x  y");
    expect(r.highlights).toEqual([]);
  });
});

describe("parseNarrationLines", () => {
  it("drops blank lines and trims", () => {
    const r = parseNarrationLines("  foo\n\n bar \n");
    expect(r).toHaveLength(2);
    expect(r[0]!.ttsText).toBe("foo");
    expect(r[1]!.ttsText).toBe("bar");
  });
});

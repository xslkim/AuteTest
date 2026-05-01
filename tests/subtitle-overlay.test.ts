import { describe, expect, it } from "vitest";
import {
  findActiveLineIndex,
  splitTtsTextWithHighlights,
} from "../remotion/components/SubtitleOverlay.js";

describe("findActiveLineIndex", () => {
  it("第一行在起始时刻命中", () => {
    expect(
      findActiveLineIndex(0, [
        { lineIndex: 0, startMs: 0, endMs: 1000 },
        { lineIndex: 1, startMs: 1200, endMs: 1700 },
      ]),
    ).toBe(0);
  });

  it("行间 200ms 间隙不显示字幕", () => {
    expect(
      findActiveLineIndex(1100, [
        { lineIndex: 0, startMs: 0, endMs: 1000 },
        { lineIndex: 1, startMs: 1200, endMs: 1700 },
      ]),
    ).toBeNull();
  });

  it("第二行在开始后命中", () => {
    expect(
      findActiveLineIndex(1500, [
        { lineIndex: 0, startMs: 0, endMs: 1000 },
        { lineIndex: 1, startMs: 1200, endMs: 1700 },
      ]),
    ).toBe(1);
  });

  it("endMs 闭合区间含端点", () => {
    expect(
      findActiveLineIndex(1000, [{ lineIndex: 0, startMs: 0, endMs: 1000 }]),
    ).toBe(0);
  });
});

describe("splitTtsTextWithHighlights", () => {
  it("单行高亮切片", () => {
    expect(
      splitTtsTextWithHighlights("hello world", [{ start: 6, end: 11 }]),
    ).toEqual([
      { text: "hello ", highlight: false },
      { text: "world", highlight: true },
    ]);
  });

  it("两段高亮", () => {
    expect(
      splitTtsTextWithHighlights("a b c d", [
        { start: 2, end: 3 },
        { start: 6, end: 7 },
      ]),
    ).toEqual([
      { text: "a ", highlight: false },
      { text: "b", highlight: true },
      { text: " c ", highlight: false },
      { text: "d", highlight: true },
    ]);
  });

  it("重叠高亮区间合并", () => {
    expect(
      splitTtsTextWithHighlights("abcdef", [
        { start: 1, end: 3 },
        { start: 2, end: 4 },
      ]),
    ).toEqual([
      { text: "a", highlight: false },
      { text: "bcd", highlight: true },
      { text: "ef", highlight: false },
    ]);
  });

  it("越界片段被裁剪", () => {
    expect(splitTtsTextWithHighlights("ab", [{ start: -9, end: 1 }])).toEqual([
      { text: "a", highlight: true },
      { text: "b", highlight: false },
    ]);
  });
});

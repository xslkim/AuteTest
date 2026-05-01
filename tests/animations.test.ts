import { describe, expect, it } from "vitest";
import { getAnimationStyle } from "../remotion/engine/animations.js";

describe("getAnimationStyle", () => {
  it("fade-up: t=0 透明且下移；t=1 完全不透明且归位", () => {
    const fn = getAnimationStyle("fade-up");
    const a = fn(0);
    expect(a.opacity).toBe(0);
    expect(a.transform).toContain("translateY(8%)");
    const b = fn(1);
    expect(b.opacity).toBe(1);
    expect(b.transform).toContain("translateY(0%)");
  });

  it("fade: 仅透明度", () => {
    const fn = getAnimationStyle("fade");
    expect(fn(0).opacity).toBe(0);
    expect(fn(0.5).opacity).toBe(0.5);
    expect(fn(1).opacity).toBe(1);
    expect(fn(1).transform).toBeUndefined();
  });

  it("none: 空样式", () => {
    const fn = getAnimationStyle("none");
    expect(fn(0)).toEqual({});
    expect(fn(0.99)).toEqual({});
  });

  it("progress 钳制到 [0,1]", () => {
    const fn = getAnimationStyle("fade-up");
    expect(fn(-0.5).opacity).toBe(0);
    expect(fn(2).opacity).toBe(1);
  });

  it("zoom-in: 由小变大", () => {
    const fn = getAnimationStyle("zoom-in");
    const s0 = (fn(0).transform as string).match(/scale\(([^)]+)\)/)?.[1];
    const s1 = (fn(1).transform as string).match(/scale\(([^)]+)\)/)?.[1];
    expect(Number(s0)).toBeLessThan(1);
    expect(Number(s1)).toBe(1);
  });
});

import type { CSSProperties } from "react";
import type { AnimationPreset } from "../../src/types/script.js";

function clamp01(t: number): number {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t;
}

const FADE_SHIFT_PCT = 8;
const SLIDE_SHIFT_PCT = 12;
const ZOOM_IN_MIN = 0.88;
const ZOOM_OUT_MAX = 1.12;

/** preset(progress) → style; progress ∈ [0,1]，0 = 动画起点，1 = 终点（入场结束 / 出场映射见 BlockFrame）。 */
export function getAnimationStyle(preset: AnimationPreset): (progress: number) => CSSProperties {
  switch (preset) {
    case "none":
      return () => ({});
    case "fade":
      return (p) => {
        const t = clamp01(p);
        return { opacity: t };
      };
    case "fade-up":
      return (p) => {
        const t = clamp01(p);
        return {
          opacity: t,
          transform: `translateY(${(1 - t) * FADE_SHIFT_PCT}%)`,
        };
      };
    case "fade-down":
      return (p) => {
        const t = clamp01(p);
        return {
          opacity: t,
          transform: `translateY(${(t - 1) * FADE_SHIFT_PCT}%)`,
        };
      };
    case "slide-left":
      return (p) => {
        const t = clamp01(p);
        return {
          opacity: t,
          transform: `translateX(${(1 - t) * SLIDE_SHIFT_PCT}%)`,
        };
      };
    case "slide-right":
      return (p) => {
        const t = clamp01(p);
        return {
          opacity: t,
          transform: `translateX(${(t - 1) * SLIDE_SHIFT_PCT}%)`,
        };
      };
    case "zoom-in":
      return (p) => {
        const t = clamp01(p);
        const s = ZOOM_IN_MIN + (1 - ZOOM_IN_MIN) * t;
        return {
          opacity: t,
          transform: `scale(${s})`,
        };
      };
    case "zoom-out":
      return (p) => {
        const t = clamp01(p);
        const s = ZOOM_OUT_MAX - (ZOOM_OUT_MAX - 1) * t;
        return {
          opacity: t,
          transform: `scale(${s})`,
        };
      };
  }
}

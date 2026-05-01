/**
 * Visuals 校验用最小类型契约：LLM 组件不写 import path，由 tsconfig 注入全局类型别名。
 */
import type { AnimationProps as _AnimationProps, Theme as _Theme } from "../types/script.js";

declare global {
  type AnimationProps = _AnimationProps;
  type Theme = _Theme;
}

export {};

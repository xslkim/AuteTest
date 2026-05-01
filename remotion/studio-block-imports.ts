import type { ComponentType } from "react";
import type { AnimationProps } from "../src/types/script.js";

/** Studio 演示用；render 时 bundle 将 `@autovideo-block-imports` 指到 build dir 生成文件 */
export const blockLoaders: Record<
  string,
  () => Promise<{ default: ComponentType<AnimationProps> }>
> = {
  B01: () => import("../src/blocks/B01/Component.js"),
};

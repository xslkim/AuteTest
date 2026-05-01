import type { ReactNode, ReactElement } from "react";
import { z } from "zod";

/** §3.8 / Block.enter Block.exit */
export type AnimationPreset =
  | "fade"
  | "fade-up"
  | "fade-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "none";

export const ANIMATION_PRESETS = [
  "fade",
  "fade-up",
  "fade-down",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "none",
] as const satisfies readonly AnimationPreset[];

/** PRD §4 — LLM 生成组件 props */
export interface AnimationProps {
  frame: number;
  durationInFrames: number;
  width: number;
  height: number;
  subtitleSafeBottom: number;
  theme: Theme;
  fps: number;
}

/** Remotion 引擎外壳（用户不写） */
export interface BlockFrameProps {
  enter: AnimationPreset;
  exit: AnimationPreset;
  enterFrames: number;
  exitFrames: number;
  durationInFrames: number;
  fps: number;
  children: ReactNode;
}

export interface SubtitleOverlayProps {
  lines: NarrationLine[];
  lineTimings: { lineIndex: number; startMs: number; endMs: number }[];
  audioStartFrame: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  theme: Theme;
}

export interface Theme {
  name: string;
  colors: {
    bg: string;
    fg: string;
    accent: string;
    muted: string;
    code: {
      bg: string;
      fg: string;
      keyword: string;
      string: string;
      comment: string;
    };
  };
  fonts: { sans: string; mono: string };
  spacing: { unit: number };
  subtitle: {
    fontFamily: string;
    fontSizePct: number;
    lineHeight: number;
    maxWidthPct: number;
    backgroundColor: string;
    paddingPx: number;
  };
}

export interface NarrationLine {
  text: string;
  ttsText: string;
  highlights: { start: number; end: number }[];
}

export interface Block {
  id: string;
  title: string;
  enter: AnimationPreset;
  exit: AnimationPreset;

  visual: {
    description: string;
    componentPath?: string;
  };

  narration: {
    lines: NarrationLine[];
    explicitDurationSec?: number;
  };

  audio?: {
    wavPath: string;
    durationSec: number;
    lineTimings: { lineIndex: number; startMs: number; endMs: number }[];
  };

  timing?: {
    enterSec: number;
    holdSec: number;
    exitSec: number;
    totalSec: number;
    frames: number;
    enterFrames: number;
  };

  render?: {
    partialPath: string;
    cacheHit: boolean;
  };
}

export interface Script {
  meta: {
    schemaVersion: "1.0";
    title: string;
    voiceRef: string;
    aspect: "16:9" | "9:16" | "1:1";
    width: number;
    height: number;
    fps: number;
    theme: string;
    subtitleSafeBottom: number;
  };
  blocks: Block[];
  artifacts: {
    compiledAt?: string;
    audioGeneratedAt?: string;
    visualsGeneratedAt?: string;
    renderedAt?: string;
  };
  assets: Record<string, string>;
}

/** Stage readiness — TS 层收紧；IR JSON 仍用单一宽松 schema 校验结构 */
export type CompiledBlock = Omit<Block, "timing" | "render" | "visual"> & {
  /** compile 输出无此字段；visuals 成功后写回 */
  visual: { description: string; componentPath?: string };
};

export type CompiledScript = Omit<Script, "blocks"> & {
  blocks: CompiledBlock[];
};

export type AudioReadyBlock = Omit<
  Block,
  "timing" | "render" | "visual"
> & {
  visual: { description: string };
  audio: NonNullable<Block["audio"]>;
};

export type AudioReadyScript = Omit<Script, "blocks"> & {
  blocks: AudioReadyBlock[];
};

export type VisualReadyBlock = Omit<Block, "timing" | "render" | "visual"> & {
  visual: { description: string; componentPath: string };
};

export type VisualReadyScript = Omit<Script, "blocks"> & {
  blocks: VisualReadyBlock[];
};

export type RenderInputBlock = Omit<
  Block,
  "timing" | "render" | "visual" | "audio"
> & {
  visual: { description: string; componentPath: string };
  audio: NonNullable<Block["audio"]>;
};

export type RenderInputScript = Omit<Script, "blocks"> & {
  blocks: RenderInputBlock[];
};

export type RenderedBlock = Omit<
  Block,
  "timing" | "render" | "visual" | "audio"
> & {
  visual: { description: string; componentPath: string };
  audio: NonNullable<Block["audio"]>;
  timing: NonNullable<Block["timing"]>;
  render: NonNullable<Block["render"]>;
};

export type RenderedScript = Omit<Script, "blocks"> & {
  blocks: RenderedBlock[];
};

/** 默认导出组件签名（文档 / 约束生成用） */
export type BlockVisualComponent = (
  props: AnimationProps,
) => ReactElement | null;

// --- Zod：宽松 JSON 结构校验（stage 前置条件靠 readiness 类型 + 专用 assert） ---

const animationPresetSchema = z.enum([
  "fade",
  "fade-up",
  "fade-down",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "none",
]);

const narrationLineSchema = z.object({
  text: z.string(),
  ttsText: z.string(),
  highlights: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
    }),
  ),
});

const blockSchema: z.ZodType<Block> = z
  .object({
    id: z.string(),
    title: z.string(),
    enter: animationPresetSchema,
    exit: animationPresetSchema,
    visual: z.object({
      description: z.string(),
      componentPath: z.string().optional(),
    }),
    narration: z.object({
      lines: z.array(narrationLineSchema),
      explicitDurationSec: z.number().optional(),
    }),
    audio: z
      .object({
        wavPath: z.string(),
        durationSec: z.number(),
        lineTimings: z.array(
          z.object({
            lineIndex: z.number(),
            startMs: z.number(),
            endMs: z.number(),
          }),
        ),
      })
      .optional(),
    timing: z
      .object({
        enterSec: z.number(),
        holdSec: z.number(),
        exitSec: z.number(),
        totalSec: z.number(),
        frames: z.number(),
        enterFrames: z.number(),
      })
      .optional(),
    render: z
      .object({
        partialPath: z.string(),
        cacheHit: z.boolean(),
      })
      .optional(),
  })
  .passthrough() as z.ZodType<Block>;

export const scriptSchema: z.ZodType<Script> = z
  .object({
    meta: z.object({
      schemaVersion: z.literal("1.0"),
      title: z.string(),
      voiceRef: z.string(),
      aspect: z.enum(["16:9", "9:16", "1:1"]),
      width: z.number(),
      height: z.number(),
      fps: z.number(),
      theme: z.string(),
      subtitleSafeBottom: z.number(),
    }),
    blocks: z.array(blockSchema),
    artifacts: z
      .object({
        compiledAt: z.string().optional(),
        audioGeneratedAt: z.string().optional(),
        visualsGeneratedAt: z.string().optional(),
        renderedAt: z.string().optional(),
      })
      .passthrough(),
    assets: z.record(z.string()),
  })
  .passthrough();

const compiledBlockSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    enter: animationPresetSchema,
    exit: animationPresetSchema,
    visual: z.object({
      description: z.string(),
      componentPath: z.string().optional(),
    }),
    narration: z.object({
      lines: z.array(narrationLineSchema),
      explicitDurationSec: z.number().optional(),
    }),
    audio: z
      .object({
        wavPath: z.string(),
        durationSec: z.number(),
        lineTimings: z.array(
          z.object({
            lineIndex: z.number(),
            startMs: z.number(),
            endMs: z.number(),
          }),
        ),
      })
      .optional(),
  })
  .strict();

const compiledScriptSchema = z
  .object({
    meta: z.object({
      schemaVersion: z.literal("1.0"),
      title: z.string(),
      voiceRef: z.string(),
      aspect: z.enum(["16:9", "9:16", "1:1"]),
      width: z.number(),
      height: z.number(),
      fps: z.number(),
      theme: z.string(),
      subtitleSafeBottom: z.number(),
    }),
    blocks: z.array(compiledBlockSchema),
    artifacts: z
      .object({
        compiledAt: z.string().optional(),
        audioGeneratedAt: z.string().optional(),
        visualsGeneratedAt: z.string().optional(),
        renderedAt: z.string().optional(),
      })
      .strict(),
    assets: z.record(z.string()),
  })
  .strict();

export function parseScriptJson(data: unknown): Script {
  return scriptSchema.parse(data);
}

export function assertCompiledScript(data: unknown): asserts data is CompiledScript {
  compiledScriptSchema.parse(data);
}

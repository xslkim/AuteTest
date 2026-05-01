/**
 * Stage 4 render：`BlockComposition` 组合动态块组件、字幕与延迟音频。
 * `@PRD.md` §6.4 step 3；cwd 约定下 `staticFile(\`audio/${blockId}.wav\`)` 指向 `public/audio/`。
 */

import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AnimationProps, Block, Script } from "../src/types/script.js";
import { SubtitleOverlay } from "./components/SubtitleOverlay.js";
import { BlockFrame } from "./engine/block-frame.js";
import { getTheme } from "./engine/theme.js";
import { fetchScriptJson } from "./load-script-runtime.js";

export type BlockComponentLoader = () => Promise<{
  default: ComponentType<AnimationProps>;
}>;

const MIN_HOLD_SEC = 1.5;
const DEFAULT_ENTER_SEC = 0.5;
const DEFAULT_EXIT_SEC = 0.3;

/** 与 Remotion bundle 静态 URL 一致：`/public/script.json`（见 `load-script-runtime`）。 */
export const DEFAULT_SCRIPT_PUBLIC_PATH = "public/script.json";

function enterExitFrames(
  fps: number,
  enterPreset: Block["enter"],
  exitPreset: Block["exit"],
): { enterFrames: number; exitFrames: number } {
  const enterSec = enterPreset === "none" ? 0 : DEFAULT_ENTER_SEC;
  const exitSec = exitPreset === "none" ? 0 : DEFAULT_EXIT_SEC;
  return {
    enterFrames: Math.round(enterSec * fps),
    exitFrames: Math.round(exitSec * fps),
  };
}

function parseScriptJson(raw: string): Script {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("script.json: root must be an object");
  }
  const obj = parsed as { meta?: unknown; blocks?: unknown };
  if (typeof obj.meta !== "object" || obj.meta === null || !Array.isArray(obj.blocks)) {
    throw new Error("script.json: missing meta or blocks");
  }
  return parsed as Script;
}

function computedTimingForBlock(
  block: Block,
  fps: number,
): { durationInFrames: number; enterFrames: number; exitFrames: number } {
  if (block.timing) {
    return {
      enterFrames: block.timing.enterFrames,
      exitFrames: Math.round(block.timing.exitSec * fps),
      durationInFrames: block.timing.frames,
    };
  }

  const { enterFrames, exitFrames } = enterExitFrames(fps, block.enter, block.exit);
  const holdSec = Math.max(
    block.audio?.durationSec ?? 0,
    block.narration.explicitDurationSec ?? 0,
    MIN_HOLD_SEC,
  );
  const holdFrames = Math.max(1, Math.round(holdSec * fps));
  const durationInFrames = enterFrames + holdFrames + exitFrames;
  return { enterFrames, exitFrames, durationInFrames };
}

/**
 * preview / Studio：`Composition.durationInFrames` 需与块内 `computedTimingForBlock` 一致。
 */
export function previewCompositionDurationFrames(block: Block, fps: number): number {
  return computedTimingForBlock(block, fps).durationInFrames;
}

/** §6.5：无 TTS `lineTimings` 时在 hold 段内按行均匀切段（仅预览字幕布局）。 */
export function uniformLineTimingsForPreview(
  lineCount: number,
  holdMs: number,
): { lineIndex: number; startMs: number; endMs: number }[] {
  if (lineCount <= 0 || holdMs <= 0) {
    return [];
  }
  const slice = holdMs / lineCount;
  const out: { lineIndex: number; startMs: number; endMs: number }[] = [];
  for (let i = 0; i < lineCount; i++) {
    out.push({
      lineIndex: i,
      startMs: Math.round(i * slice),
      endMs: Math.round((i + 1) * slice),
    });
  }
  const last = out[out.length - 1];
  if (last != null) {
    last.endMs = Math.round(holdMs);
  }
  return out;
}

export interface BlockCompositionProps {
  blockId: string;
  blockLoaders: Record<string, BlockComponentLoader>;
  /** 相对 Remotion `public/` */
  scriptPublicPath?: string;
}

export const BlockComposition: React.FC<BlockCompositionProps> = ({
  blockId,
  blockLoaders,
  scriptPublicPath = DEFAULT_SCRIPT_PUBLIC_PATH,
}) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const [script, setScript] = useState<Script | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const DynamicComponent = useMemo(() => {
    const loader = blockLoaders[blockId];
    if (loader == null) {
      return lazy(async () => ({
        default: function MissingBlock() {
          return (
            <AbsoluteFill
              style={{
                backgroundColor: "#400",
                justifyContent: "center",
                alignItems: "center",
                color: "#fff",
                padding: 24,
              }}
            >
              {`No block loader for ${blockId}`}
            </AbsoluteFill>
          );
        },
      }));
    }
    return lazy(loader);
  }, [blockId, blockLoaders]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const text = await fetchScriptJson(scriptPublicPath);
        if (cancelled) {
          return;
        }
        setScript(parseScriptJson(text));
        setParseError(null);
      } catch (e) {
        if (!cancelled) {
          setParseError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scriptPublicPath]);

  const block = useMemo(() => {
    if (!script) {
      return null;
    }
    return script.blocks.find((b) => b.id === blockId) ?? null;
  }, [script, blockId]);

  const theme = useMemo(
    () => (script ? getTheme(script.meta.theme) : null),
    [script],
  );

  const timing = useMemo(() => {
    if (!block) {
      return null;
    }
    return computedTimingForBlock(block, fps);
  }, [block, fps]);

  if (parseError) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#300",
          justifyContent: "center",
          alignItems: "center",
          color: "#fff",
          padding: 24,
        }}
      >
        {parseError}
      </AbsoluteFill>
    );
  }

  if (!script || !block || !theme || !timing) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#111",
          justifyContent: "center",
          alignItems: "center",
          color: "#888",
        }}
      >
        Loading…
      </AbsoluteFill>
    );
  }

  const wavRel =
    block.audio?.wavPath != null && block.audio.wavPath.startsWith("public/")
      ? block.audio.wavPath.slice("public/".length)
      : `audio/${block.id}.wav`;

  const holdMs =
    ((timing.durationInFrames - timing.enterFrames - timing.exitFrames) / fps) * 1000;

  const storedLineTimings = block.audio?.lineTimings;
  const subtitleLineTimings =
    storedLineTimings != null && storedLineTimings.length > 0
      ? storedLineTimings
      : uniformLineTimingsForPreview(block.narration.lines.length, holdMs);

  const animationProps = {
    frame,
    durationInFrames: timing.durationInFrames,
    width,
    height,
    subtitleSafeBottom: script.meta.subtitleSafeBottom,
    theme,
    fps,
  };

  const hasAudio =
    !!block.audio && storedLineTimings != null && storedLineTimings.length > 0;

  return (
    <BlockFrame
      enter={block.enter}
      exit={block.exit}
      enterFrames={timing.enterFrames}
      exitFrames={timing.exitFrames}
      durationInFrames={timing.durationInFrames}
      fps={fps}
    >
      <Suspense
        fallback={(
          <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
            <span style={{ color: theme.colors.muted, padding: 24 }}>Loading block…</span>
          </AbsoluteFill>
        )}
      >
        <DynamicComponent {...animationProps} />
      </Suspense>
      <SubtitleOverlay
        lines={block.narration.lines}
        lineTimings={subtitleLineTimings}
        audioStartFrame={timing.enterFrames}
        frame={frame}
        fps={fps}
        width={width}
        height={height}
        theme={theme}
      />
      {hasAudio ? (
        <Sequence from={timing.enterFrames}>
          <Audio src={staticFile(wavRel)} />
        </Sequence>
      ) : null}
    </BlockFrame>
  );
};

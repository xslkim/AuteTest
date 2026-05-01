import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PartialManifestKeyFields } from "../cache/store.js";
import type { Block } from "../types/script.js";

export interface PartialCacheKeyParts {
  componentHash: string;
  audioHash: string;
  theme: string;
  width: number;
  height: number;
  fps: number;
  enter: string;
  exit: string;
  remotionVersion: string;
}

function md5HexMissingFileLabel(pathStr: string): string {
  return createHash("md5").update(`MISSING:${pathStr}`, "utf8").digest("hex");
}

/** 文件内容 MD5 hex；不可读时用稳定占位（便于提前失败前仍可用于 key 调试） */
export function fileContentMd5Hex(absPath: string): string {
  try {
    return createHash("md5").update(readFileSync(absPath)).digest("hex");
  } catch {
    return md5HexMissingFileLabel(absPath);
  }
}

/** PRD §11.2 — partial 拼接后再 MD5，得到 manifest / lookup key（无前缀） */
export function partialCacheKeyHex(parts: PartialCacheKeyParts): string {
  const payload = [
    parts.componentHash,
    parts.audioHash,
    parts.theme,
    String(parts.width),
    String(parts.height),
    String(parts.fps),
    parts.enter,
    parts.exit,
    parts.remotionVersion,
  ].join("\0");
  return createHash("md5").update(payload, "utf8").digest("hex");
}

export interface PartialCacheBundleInput {
  block: Block;
  scriptTheme: string;
  width: number;
  height: number;
  fps: number;
  buildOutDirAbs: string;
  remotionVersion: string;
}

/**
 * `manifest.key`（§11.3）与 `partial:{cacheKeyHex}` lookup 用 hex。
 * `componentPath` / `wavPath` 相对 build out dir。
 */
export function computePartialCacheBundle(
  input: PartialCacheBundleInput,
): {
  cacheKeyHex: string;
  manifestKey: PartialManifestKeyFields;
  componentHash: string;
  audioHash: string;
} {
  const { block, scriptTheme, width, height, fps, buildOutDirAbs, remotionVersion } =
    input;

  const compRel = block.visual.componentPath;
  if (typeof compRel !== "string" || compRel.length === 0) {
    throw new Error(`partial cache: block "${block.id}" has no visual.componentPath`);
  }
  const audioRel = block.audio?.wavPath;
  if (typeof audioRel !== "string" || audioRel.length === 0) {
    throw new Error(`partial cache: block "${block.id}" has no audio.wavPath`);
  }

  const componentAbs = resolve(buildOutDirAbs, compRel);
  const audioAbs = resolve(buildOutDirAbs, audioRel);

  const componentHash = fileContentMd5Hex(componentAbs);
  const audioHash = fileContentMd5Hex(audioAbs);

  const manifestKey: PartialManifestKeyFields = {
    componentHash,
    audioHash,
    theme: scriptTheme,
    width,
    height,
    fps,
    enter: block.enter,
    exit: block.exit,
    remotionVersion,
  };

  const cacheKeyHex = partialCacheKeyHex({
    componentHash,
    audioHash,
    theme: scriptTheme,
    width,
    height,
    fps,
    enter: block.enter,
    exit: block.exit,
    remotionVersion,
  });

  return { cacheKeyHex, manifestKey, componentHash, audioHash };
}

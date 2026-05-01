import { createHash } from "node:crypto";

import type { ComponentManifestKeyFields } from "../cache/store.js";

/** compile 写入的描述：`assets/` + 8 位 hex + 扩展名 */
const ASSETS_HASH_RE = /assets\/([a-f0-9]{8})\.[a-zA-Z0-9]+/g;

/**
 * 从 visual.description 中提取 `assets/{hash}.ext` 的 hash（8 hex），排序去重后 JSON 序列化。
 * PRD §11.2 `assetHashesJson`
 */
export function assetHashesJsonFromVisualDescription(description: string): string {
  const seen = new Set<string>();
  ASSETS_HASH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSETS_HASH_RE.exec(description)) !== null) {
    seen.add(m[1]!);
  }
  const sorted = [...seen].sort((a, b) => a.localeCompare(b));
  return JSON.stringify(sorted);
}

/** PRD §11.3 manifest：`descriptionHash`（描述全文 MD5 hex） */
export function visualDescriptionMd5Hex(description: string): string {
  return createHash("md5").update(description, "utf8").digest("hex");
}

export interface ComponentCacheKeyParts {
  description: string;
  theme: string;
  width: number;
  height: number;
  promptVersion: string;
  assetHashesJson: string;
  claudeModel: string;
}

/** PRD §11.2 — component 缓存键（无前缀）；拼接后再 MD5 hex */
export function componentCacheKeyHex(parts: ComponentCacheKeyParts): string {
  const payload = [
    parts.description,
    parts.theme,
    String(parts.width),
    String(parts.height),
    parts.promptVersion,
    parts.assetHashesJson,
    parts.claudeModel,
  ].join("\0");
  return createHash("md5").update(payload, "utf8").digest("hex");
}

export interface ComponentCacheBundleInput {
  theme: string;
  width: number;
  height: number;
  promptVersion: string;
  claudeModel: string;
  visualDescription: string;
}

/** 单次计算：`manifest.key` + lookup/push 用的 cache key hex */
export function computeComponentCacheBundle(input: ComponentCacheBundleInput): {
  cacheKeyHex: string;
  manifestKey: ComponentManifestKeyFields;
} {
  const assetHashesJson = assetHashesJsonFromVisualDescription(input.visualDescription);
  const manifestKey: ComponentManifestKeyFields = {
    descriptionHash: visualDescriptionMd5Hex(input.visualDescription),
    theme: input.theme,
    width: input.width,
    height: input.height,
    promptVersion: input.promptVersion,
    assetHashesJson,
    claudeModel: input.claudeModel,
  };
  const cacheKeyHex = componentCacheKeyHex({
    description: input.visualDescription,
    theme: input.theme,
    width: input.width,
    height: input.height,
    promptVersion: input.promptVersion,
    assetHashesJson,
    claudeModel: input.claudeModel,
  });
  return { cacheKeyHex, manifestKey };
}

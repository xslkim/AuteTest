import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { AudioManifestKeyFields } from "../cache/store.js";
import type { VoxcpmSection } from "../config/types.js";

/** PRD §11.2 — 参考音频整文件 MD5（全 hex，非 8 位截断） */
export function computeVoiceRefHash(voiceRefAbsPath: string): string {
  const buf = readFileSync(voiceRefAbsPath);
  return createHash("md5").update(buf).digest("hex");
}

/**
 * PRD §11.2 — 权重目录变更感知：`config.json` 存在则 hash 其内容；
 * 否则取目录内第一个按名排序的 `.safetensors` / `.bin` 的文件内容 hash；
 * 皆无则 hash `modelDir` 绝对路径字符串（便于 CI 无权重时仍稳定）。
 */
export function computeVoxcpmModelVersion(modelDirAbs: string): string {
  const configPath = join(modelDirAbs, "config.json");
  if (existsSync(configPath)) {
    return createHash("md5").update(readFileSync(configPath)).digest("hex");
  }
  try {
    const names = readdirSync(modelDirAbs, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => n.endsWith(".safetensors") || n.endsWith(".bin"))
      .sort();
    const first = names[0];
    if (first) {
      return createHash("md5").update(readFileSync(join(modelDirAbs, first))).digest("hex");
    }
  } catch {
    /* empty or unreadable */
  }
  return createHash("md5").update(modelDirAbs).digest("hex");
}

/** PRD §11.2 — 拼接字符串再 MD5，得到 manifest `audio:` 键（无前缀） */
export function ttsAudioCacheKey(metadata: AudioManifestKeyFields): string {
  const payload = [
    metadata.ttsText,
    metadata.voiceRefHash,
    String(metadata.cfgValue),
    String(metadata.inferenceTimesteps),
    metadata.denoise ? "1" : "0",
    metadata.voxcpmModelVersion,
  ].join("\0");
  return createHash("md5").update(payload, "utf8").digest("hex");
}

export function buildAudioManifestKey(
  line: { ttsText: string },
  voiceRefHash: string,
  voxcpm: VoxcpmSection,
  voxcpmModelVersion: string,
): AudioManifestKeyFields {
  return {
    ttsText: line.ttsText,
    voiceRefHash,
    cfgValue: voxcpm.cfgValue,
    inferenceTimesteps: voxcpm.inferenceTimesteps,
    denoise: voxcpm.denoise,
    voxcpmModelVersion,
  };
}

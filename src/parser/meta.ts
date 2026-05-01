import { accessSync, constants, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { expandUserPath } from "../config/load.js";
import type { MetaCliKey, MetaOverrideValue } from "../config/types.js";

/** PRD §3.4 / §4：解析并校验后的全局 meta（不含 `schemaVersion`，由 compile 写入 IR） */
export interface ParsedMeta {
  title: string;
  /** 参考音频绝对路径（已校验可读） */
  voiceRef: string;
  aspect: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
  fps: number;
  theme: string;
  subtitleSafeBottom: number;
  /** PRD §7：`slug:` 可选，覆盖自动 slug（仅 meta.md，非 `--meta`） */
  slug?: string;
}

const ASPECT_DIMS: Record<ParsedMeta["aspect"], { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

const ALLOWED_META_KEYS = new Set([
  "title",
  "voiceRef",
  "aspect",
  "theme",
  "fps",
  "slug",
]);

function assertVoiceRefReadable(absPath: string): void {
  try {
    accessSync(absPath, constants.R_OK);
  } catch {
    throw new Error(
      `voiceRef 文件不存在或不可读: ${absPath}`,
    );
  }
}

function stripCommentValue(raw: string): string {
  const idx = raw.indexOf("#");
  if (idx === -1) return raw.trim();
  return raw.slice(0, idx).trim();
}

/**
 * 从 `meta.md` 全文解析 `--- meta ---` … `---` 之间的 `key: value` 行。
 */
export function parseMetaYamlLikeSection(
  fileContent: string,
  metaMdPath: string,
): Record<string, string> {
  const lines = fileContent.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === "--- meta ---") {
      start = i + 1;
      break;
    }
  }
  if (start < 0) {
    throw new Error(`未找到 --- meta --- 段: ${metaMdPath}`);
  }

  const out: Record<string, string> = {};
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const t = line.trim();
    if (t === "---") break;

    if (!t || t.startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon <= 0) {
      throw new Error(`${metaMdPath}:${i + 1}: meta 行必须为 key: value 形式`);
    }
    const key = line.slice(0, colon).trim();
    const valueRaw = stripCommentValue(line.slice(colon + 1));
    if (!key) {
      throw new Error(`${metaMdPath}:${i + 1}: 空的 meta 键`);
    }
    if (!ALLOWED_META_KEYS.has(key)) {
      throw new Error(
        `${metaMdPath}:${i + 1}: 未知的 meta 键 ${JSON.stringify(key)}（允许: ${[...ALLOWED_META_KEYS].join(", ")}）`,
      );
    }
    if (key in out) {
      throw new Error(`${metaMdPath}: meta 键 ${JSON.stringify(key)} 重复定义`);
    }
    out[key] = valueRaw;
  }

  return out;
}

function parseAspect(raw: string | undefined, pathLabel: string): ParsedMeta["aspect"] {
  const v = (raw ?? "16:9").trim();
  if (v === "16:9" || v === "9:16" || v === "1:1") return v;
  throw new Error(`${pathLabel}: aspect 仅支持 16:9 / 9:16 / 1:1，收到 ${JSON.stringify(v)}`);
}

function parseFps(raw: string | undefined, pathLabel: string): number {
  const v = (raw ?? "30").trim();
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || String(n) !== v || n < 1) {
    throw new Error(`${pathLabel}: fps 必须为正整数，收到 ${JSON.stringify(raw ?? "30")}`);
  }
  return n;
}

function applyMetaOverrides(
  base: Record<string, string>,
  overrides: Partial<Record<MetaCliKey, MetaOverrideValue>> | undefined,
  metaMdPath: string,
): Record<string, string> {
  const merged = { ...base };
  if (!overrides) return merged;

  for (const k of Object.keys(overrides) as MetaCliKey[]) {
    const val = overrides[k];
    if (val === undefined) continue;
    if (k === "fps") {
      if (typeof val !== "number" || !Number.isInteger(val)) {
        throw new Error(
          `--meta fps 必须为整数，收到 ${JSON.stringify(val)}（${metaMdPath}）`,
        );
      }
      merged.fps = String(val);
    } else {
      merged[k] = String(val);
    }
  }
  return merged;
}

function resolveVoiceRefToAbsolute(metaDir: string, voiceRefRaw: string): string {
  const trimmed = voiceRefRaw.trim();
  if (!trimmed) {
    throw new Error("voiceRef 不能为空");
  }
  if (isAbsolute(trimmed)) {
    return resolvePath(trimmed);
  }
  return resolvePath(metaDir, trimmed);
}

export interface ParseMetaFileInput {
  metaMdPath: string;
  /** `project.json` 所在目录，用于展开 CLI `voiceRef` 中的 `~` 等 */
  projectRootDir: string;
  metaOverrides?: Partial<Record<MetaCliKey, MetaOverrideValue>>;
}

/**
 * 读取 `meta.md`，解析 `--- meta ---` 段，合并默认与 `--meta` 覆盖，校验 §3.4 并返回分辨率等。
 */
export function parseMetaFile(input: ParseMetaFileInput): ParsedMeta {
  const { metaMdPath, projectRootDir, metaOverrides } = input;
  const text = readFileSync(metaMdPath, "utf8");
  const fromFile = parseMetaYamlLikeSection(text, metaMdPath);
  const merged = applyMetaOverrides(fromFile, metaOverrides, metaMdPath);

  const title = merged.title?.trim();
  if (!title) {
    throw new Error(`缺少必填字段 title: ${metaMdPath}`);
  }

  const metaDir = dirname(metaMdPath);
  const voiceRefFromMerged = merged.voiceRef?.trim();
  const voiceRefRaw =
    voiceRefFromMerged !== undefined && voiceRefFromMerged !== ""
      ? voiceRefFromMerged
      : "./B00.wav";

  let voiceRefAbs = resolveVoiceRefToAbsolute(metaDir, voiceRefRaw);

  // CLI 覆盖的 voiceRef：允许 `~` / 相对 project 根目录
  if (metaOverrides?.voiceRef !== undefined) {
    const o = String(metaOverrides.voiceRef).trim();
    if (!o) {
      throw new Error(`--meta voiceRef 不能为空（${metaMdPath}）`);
    }
    voiceRefAbs = isAbsolute(o)
      ? resolvePath(o)
      : expandUserPath(o, projectRootDir);
  }

  assertVoiceRefReadable(voiceRefAbs);

  const aspect = parseAspect(merged.aspect, metaMdPath);
  const dims = ASPECT_DIMS[aspect];
  const fps = parseFps(merged.fps, metaMdPath);
  const theme = (merged.theme?.trim() ?? "dark-code") || "dark-code";

  const slugRaw = merged.slug?.trim();
  const slug = slugRaw !== undefined && slugRaw !== "" ? slugRaw : undefined;

  const subtitleSafeBottom = Math.round(dims.height * 0.15);

  return {
    title,
    voiceRef: voiceRefAbs,
    aspect,
    width: dims.width,
    height: dims.height,
    fps,
    theme,
    subtitleSafeBottom,
    ...(slug !== undefined ? { slug } : {}),
  };
}

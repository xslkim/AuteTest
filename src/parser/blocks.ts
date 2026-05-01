import { readFileSync } from "node:fs";
import { parseBlockDirectives } from "./directives.js";
import type { AnimationPreset } from "../types/script.js";

const BLOCK_START_RE = /^(\s*)>>>\s*(.*?)(?:\s+#(B\d+))?\s*$/i;
const VISUAL_MARKER = "--- visual ---";
const NARRATION_MARKER = "--- narration ---";

export interface ParsedMarkdownBlock {
  id: string;
  title: string;
  enter: AnimationPreset;
  exit: AnimationPreset;
  explicitDurationSec?: number;
  /** `--- visual ---` 与 `--- narration ---` 之间的正文（去首尾换行，保留内部换行） */
  visualDescription: string;
  /** `--- narration ---` 之后到块结束的正文（供 T1.3 预处理） */
  narrationRaw: string;
  /** 来源 .md 绝对路径（报错与溯源） */
  sourcePath: string;
}

interface RawBlockRegion {
  filePath: string;
  /** `>>>` 所在行，1-based */
  startLine: number;
  /** 块最后一行，1-based（含） */
  endLine: number;
  title: string;
  explicitId: string | undefined;
  bodyLines: string[];
}

function normalizeBlockId(raw: string): string {
  const m = raw.match(/^B(\d+)$/i);
  if (!m) return raw;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return raw.toUpperCase();
  return `B${String(n).padStart(2, "0")}`;
}

function autoIdForIndex(oneBasedIndex: number): string {
  return `B${String(oneBasedIndex).padStart(2, "0")}`;
}

function extractRegionsFromFile(filePath: string, content: string): RawBlockRegion[] {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*>>>/.test(line)) starts.push(i);
  }

  if (starts.length === 0) {
    throw new Error(`${filePath}: 未找到任何以 >>> 开头的块`);
  }

  // 第一个 >>> 之前的非空内容报错（内容文件不应有前言）
  for (let i = 0; i < starts[0]!; i++) {
    const t = (lines[i] ?? "").trim();
    if (t) {
      throw new Error(`${filePath}:${i + 1}: 首个块之前存在非空内容（内容文件只能包含 >>> 块）`);
    }
  }

  const regions: RawBlockRegion[] = [];
  for (let b = 0; b < starts.length; b++) {
    const startIdx = starts[b]!;
    const endIdx = b + 1 < starts.length ? starts[b + 1]! - 1 : lines.length - 1;
    const headerLine = lines[startIdx] ?? "";
    const hm = headerLine.match(BLOCK_START_RE);
    if (!hm) {
      throw new Error(`${filePath}:${startIdx + 1}: 无效的块标题行`);
    }
    const title = (hm[2] ?? "").trim();
    const explicitId = hm[3] ? normalizeBlockId(hm[3].toUpperCase()) : undefined;
    const bodyLines = lines.slice(startIdx + 1, endIdx + 1);
    regions.push({
      filePath,
      startLine: startIdx + 1,
      endLine: endIdx + 1,
      title,
      explicitId,
      bodyLines,
    });
  }
  return regions;
}

function findMarkerIndex(
  lines: string[],
  marker: string,
  filePath: string,
  errLineOffset: number,
): number {
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").trim() === marker) return i;
  }
  throw new Error(`${filePath}:${errLineOffset}: 缺少 ${marker} 段标记`);
}

function parseOneRegion(region: RawBlockRegion): ParsedMarkdownBlock {
  const { filePath, bodyLines, startLine, explicitId, title } = region;
  const visualIdx = findMarkerIndex(bodyLines, VISUAL_MARKER, filePath, startLine + 1);
  const narrationIdx = findMarkerIndex(
    bodyLines,
    NARRATION_MARKER,
    filePath,
    startLine + 1 + visualIdx + 1,
  );

  if (narrationIdx <= visualIdx) {
    throw new Error(`${filePath}:${startLine + 1 + narrationIdx}: --- narration --- 必须在 --- visual --- 之后`);
  }

  const directiveLines = bodyLines.slice(0, visualIdx);
  const visualInner = bodyLines.slice(visualIdx + 1, narrationIdx);
  const narrationInner = bodyLines.slice(narrationIdx + 1);

  const directiveStartLine = startLine + 1;
  const dirs = parseBlockDirectives(directiveLines, filePath, directiveStartLine);

  return {
    id: "", // filled after global ID pass
    title,
    enter: dirs.enter,
    exit: dirs.exit,
    ...("explicitDurationSec" in dirs ? { explicitDurationSec: dirs.explicitDurationSec } : {}),
    visualDescription: visualInner.join("\n").replace(/^\n+|\n+$/g, ""),
    narrationRaw: narrationInner.join("\n").replace(/^\n+|\n+$/g, ""),
    sourcePath: filePath,
  };
}

function assignBlockIds(regions: RawBlockRegion[], partial: ParsedMarkdownBlock[]): void {
  const n = regions.length;
  const finalIds: string[] = [];
  for (let i = 0; i < n; i++) {
    finalIds.push(regions[i]!.explicitId ?? autoIdForIndex(i + 1));
  }
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const id = finalIds[i]!;
    if (seen.has(id)) {
      throw new Error(
        `块 ID 重复: ${id}（${regions[i]!.filePath}:${regions[i]!.startLine}）`,
      );
    }
    seen.add(id);
    partial[i]!.id = id;
  }
}

/**
 * 按 `project.blocks` 顺序读取多个内容 .md，以 `>>>` 切块并解析 directive 与 visual / narration 段。
 */
export function parseBlockFiles(blockPathsAbs: string[]): ParsedMarkdownBlock[] {
  const allRegions: RawBlockRegion[] = [];
  for (const p of blockPathsAbs) {
    const text = readFileSync(p, "utf8");
    allRegions.push(...extractRegionsFromFile(p, text));
  }

  const partial: ParsedMarkdownBlock[] = allRegions.map((r) => {
    const parsed = parseOneRegion(r);
    return parsed;
  });

  assignBlockIds(allRegions, partial);
  return partial;
}

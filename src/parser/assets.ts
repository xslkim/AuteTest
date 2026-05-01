import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve as resolvePath } from "node:path";

/** TASKS T1.4：相对路径必须以 `./` 或 `../` 开头 */
const LOCAL_PATH_RE =
  /(?:^|[\s])(\.\.?\/[^\s]+\.[a-zA-Z0-9]+)/g;

/** `第 30-50 行` / `第32-35行`（支持 - – —） */
const LINE_RANGE_RE = /第\s*(\d+)\s*[-–—]\s*(\d+)\s*行/g;

const CODE_EXT = new Set([
  "py",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "java",
  "kt",
  "rs",
  "go",
  "cpp",
  "cc",
  "cxx",
  "c",
  "h",
  "hpp",
  "css",
  "scss",
  "html",
  "vue",
  "svelte",
  "json",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "rb",
  "php",
  "swift",
  "dart",
]);

export interface VisualAssetInput {
  visualDescription: string;
  /** 含 visual 的 .md 绝对路径 */
  sourcePath: string;
}

export interface ProcessVisualAssetsResult {
  /** 与输入等长，已替换路径并（如适用）追加代码块 */
  descriptions: string[];
  /** key：相对 project.json 目录的 POSIX 路径；value：`assets/{hash}.{ext}` */
  assets: Record<string, string>;
}

function toPosixProjectRelative(projectRootDir: string, absPath: string): string {
  const rel = relative(projectRootDir, absPath);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`资产路径必须在项目根内: ${absPath}`);
  }
  return rel.split("\\").join("/");
}

function md5First8(content: Buffer): string {
  return createHash("md5").update(content).digest("hex").slice(0, 8);
}

function extLower(p: string): string {
  return extname(p).replace(/^\./, "").toLowerCase();
}

function fenceLang(ext: string): string {
  switch (ext) {
    case "py":
      return "python";
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "sh":
    case "bash":
    case "zsh":
      return "bash";
    default:
      return ext || "text";
  }
}

function readFileLines(absPath: string): string[] {
  const text = readFileSync(absPath, "utf8");
  return text.split(/\r?\n/);
}

function sliceWithContext(
  lines: string[],
  start1: number,
  end1: number,
  context = 5,
): { start: number; end: number; slice: string[] } {
  const n = lines.length;
  const lo = Math.max(1, start1 - context);
  const hi = Math.min(n, end1 + context);
  const slice = lines.slice(lo - 1, hi);
  return { start: lo, end: hi, slice };
}

function buildInliningSnippetsFromSegment(
  segment: string,
  absCodePath: string,
  ext: string,
): string[] {
  const fileLines = readFileLines(absCodePath);
  const n = fileLines.length;
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  LINE_RANGE_RE.lastIndex = 0;
  while ((m = LINE_RANGE_RE.exec(segment)) !== null) {
    const a = Number.parseInt(m[1]!, 10);
    const b = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) continue;
    const start1 = Math.min(a, b);
    const end1 = Math.max(a, b);
    if (start1 > n) continue;
    const cappedEnd = Math.min(end1, n);
    const { start, end, slice } = sliceWithContext(fileLines, start1, cappedEnd, 5);
    const lang = fenceLang(ext);
    const body = slice.join("\n");
    snippets.push(
      `\`\`\`${lang}\n` +
        `${body}\n` +
        `\`\`\``,
    );
  }
  return snippets;
}

function replacePathInDescription(
  description: string,
  oldToken: string,
  replacement: string,
): string {
  const re = new RegExp(`(^|[\\s])(${escapeRegExp(oldToken)})`, "g");
  return description.replace(re, (_all, prefix: string) => `${prefix}${replacement}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 扫描 visual 描述中的 `./` / `../` 本地文件引用：hash 复制到 `buildOutDir/public/assets/`，
 * 替换描述为 `assets/{hash}.{ext}`，并收集相对 project.json 的 manifest。
 *
 * 代码类扩展名且描述含「第 X-Y 行」时，将显式范围 ±5 行内联为附加的 fenced 代码块。
 */
export function processVisualAssets(
  inputs: VisualAssetInput[],
  projectRootDir: string,
  buildOutDir: string,
): ProcessVisualAssetsResult {
  /** abs path -> assets/foo.ext */
  const absToBuildPath = new Map<string, string>();
  const manifest: Record<string, string> = {};

  const descriptions: string[] = [];

  for (const { visualDescription, sourcePath } of inputs) {
    const sourceDir = resolvePath(sourcePath, "..");
    const matches: RegExpExecArray[] = [];
    LOCAL_PATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LOCAL_PATH_RE.exec(visualDescription)) !== null) {
      matches.push(match);
    }

    const seenAbsForDedup = new Set<string>();
    for (const mm of matches) {
      const rawRel = mm[1]!;
      const absRef = resolvePath(sourceDir, rawRel);
      if (seenAbsForDedup.has(absRef)) continue;
      seenAbsForDedup.add(absRef);

      if (!existsSync(absRef)) {
        throw new Error(`引用的文件不存在: ${rawRel}（解析于 ${sourcePath} → ${absRef}）`);
      }

      if (!absToBuildPath.has(absRef)) {
        const buf = readFileSync(absRef);
        const hash = md5First8(buf);
        const ext = extLower(absRef);
        const buildRel = `assets/${hash}.${ext}`;
        const dest = resolvePath(buildOutDir, "public", buildRel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(absRef, dest);
        absToBuildPath.set(absRef, buildRel);

        const key = toPosixProjectRelative(projectRootDir, absRef);
        manifest[key] = buildRel;
      }
    }

    let desc = visualDescription;
    const seenRawReplace = new Set<string>();
    for (const mm of matches) {
      const rawRel = mm[1]!;
      if (seenRawReplace.has(rawRel)) continue;
      seenRawReplace.add(rawRel);

      const absRef = resolvePath(sourceDir, rawRel);
      const buildRel = absToBuildPath.get(absRef)!;
      desc = replacePathInDescription(desc, rawRel, buildRel);
    }

    const extras: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const mm = matches[i]!;
      const rawRel = mm[1]!;
      const absRef = resolvePath(sourceDir, rawRel);
      const ext = extLower(absRef);
      if (!CODE_EXT.has(ext)) continue;
      const segStart = mm.index! + mm[0].length;
      const segEnd =
        i + 1 < matches.length ? matches[i + 1]!.index! : visualDescription.length;
      const segment = visualDescription.slice(segStart, segEnd);
      extras.push(...buildInliningSnippetsFromSegment(segment, absRef, ext));
    }
    if (extras.length > 0) {
      desc = `${desc}\n\n${extras.join("\n\n")}`;
    }

    descriptions.push(desc);
  }

  return { descriptions, assets: manifest };
}

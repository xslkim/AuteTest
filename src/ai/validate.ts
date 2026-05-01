import { parse } from "@babel/parser";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { getTheme } from "../../remotion/engine/theme.js";
import { runIsolated, type RunIsolatedOptions } from "./sandbox.js";

const require = createRequire(import.meta.url);

const thisDir = dirname(fileURLToPath(import.meta.url));
function resolveTsconfigVisualsTemplatePath(): string {
  let dir = thisDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "templates", "tsconfig.visuals.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    "找不到 templates/tsconfig.visuals.json（请从 AutoVideo 仓库根目录运行）",
  );
}

function getRepoRootFromTemplate(): string {
  const templatePath = resolveTsconfigVisualsTemplatePath();
  return dirname(dirname(templatePath));
}

/** 仓库内声明文件（tsc 不 emit .d.ts，shim 始终以源码路径为准）。 */
function getDefaultShimPath(): string {
  return join(getRepoRootFromTemplate(), "src", "ai", "visuals-shim.d.ts");
}

/** 与 TASKS / PRD §6.3 一致的禁止模块（大小写不敏感）。 */
const FORBIDDEN_IMPORT_SPECIFIERS = new Set([
  "fs",
  "node:fs",
  "path",
  "node:path",
  "child_process",
  "node:child_process",
  "http",
  "node:http",
  "https",
  "node:https",
]);

const TSC_LINE_CAP = 50;

export type ValidateStaticFailureReason = "forbidden-import" | "tsc";

export type ValidateStaticResult =
  | { ok: true }
  | {
      ok: false;
      reason: ValidateStaticFailureReason;
      message: string;
      tscStderrHead?: string[];
    };

export type ValidateRenderSmokeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | ValidateStaticFailureReason
        | "render"
        | "blank-frame";
      message: string;
      tscStderrHead?: string[];
    };

export interface VisualsTsconfigPaths {
  /** 产出的 `tsconfig.visuals.json` 绝对路径 */
  tsconfigPath: string;
  /** 写入该文件的目录（即 `buildOutDir`） */
  buildOutDir: string;
}

function normalizeSpecifier(raw: string): string {
  const spec = raw.trim();
  if (spec.startsWith("node:")) {
    return spec.toLowerCase();
  }
  return spec.split("/")[0]!.toLowerCase();
}

function isForbiddenSpecifier(spec: string): boolean {
  const n = normalizeSpecifier(spec);
  return FORBIDDEN_IMPORT_SPECIFIERS.has(n);
}

/**
 * 解析 TSX 源码，禁止 Node 危险模块、require、eval、new Function；禁止对危险模块的 dynamic import。
 */
export function scanForbiddenInSource(
  source: string,
  fileLabel: string,
): { ok: true } | { ok: false; message: string } {
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `${fileLabel}: 无法解析为 TSX（${msg}）` };
  }

  const bad: string[] = [];

  const checkImportSource = (src: string | null | undefined, loc: string): void => {
    if (!src) {
      return;
    }
    const unquoted = src.replace(/^["']|["']$/g, "");
    if (isForbiddenSpecifier(unquoted)) {
      bad.push(`${loc}：禁止的 import "${unquoted}"`);
    }
  };

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const n = node as Record<string, unknown>;
    const t = n.type as string | undefined;
    if (!t) {
      return;
    }

    if (t === "ImportDeclaration") {
      const src = (n.source as { value?: string } | undefined)?.value;
      checkImportSource(src, "import");
    }
    if (t === "ExportNamedDeclaration" || t === "ExportAllDeclaration") {
      const src = (n.source as { value?: string } | undefined)?.value;
      if (src) {
        checkImportSource(src, "export");
      }
    }
    if (t === "ImportExpression") {
      const arg = n.source;
      if (arg && typeof arg === "object" && (arg as { type?: string }).type === "StringLiteral") {
        const v = (arg as { value?: string }).value;
        checkImportSource(v ?? "", "dynamic import");
      }
    }
    if (t === "CallExpression") {
      const callee = n.callee as Record<string, unknown> | undefined;
      if (callee?.type === "Identifier" && callee.name === "require") {
        const arg0 = (n.arguments as unknown[] | undefined)?.[0] as
          | Record<string, unknown>
          | undefined;
        if (arg0?.type === "StringLiteral" && typeof arg0.value === "string") {
          checkImportSource(arg0.value, "require()");
        } else {
          bad.push("require()：仅允许字符串字面量路径时才可静态检查；此处被拒绝");
        }
      }
      if (callee?.type === "Identifier" && callee.name === "eval") {
        bad.push("禁止调用 eval()");
      }
    }
    if (t === "NewExpression") {
      const callee = n.callee as Record<string, unknown> | undefined;
      if (callee?.type === "Identifier" && callee.name === "Function") {
        bad.push("禁止使用 new Function()");
      }
    }

    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) {
        for (const item of v) {
          visit(item);
        }
      } else if (v && typeof v === "object") {
        visit(v);
      }
    }
  };

  visit(ast);

  if (bad.length > 0) {
    return { ok: false, message: `${fileLabel}：\n${bad.join("\n")}` };
  }
  return { ok: true };
}

export async function scanForbiddenImports(
  tsxPath: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const abs = pathResolve(tsxPath);
  const source = await readFile(abs, "utf8");
  return scanForbiddenInSource(source, abs);
}

function takeStderrHead(stderr: string): string[] {
  const lines = stderr.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(0, TSC_LINE_CAP);
}

const tscJsPath: string = require.resolve("typescript/lib/tsc.js");

export interface WriteVisualsTsconfigOptions {
  buildOutDir: string;
  /** 待校验的 .tsx 绝对路径 */
  componentAbsPath: string;
  /** 默认同目录 `visuals-shim.d.ts` */
  shimAbsPath?: string;
}

/**
 * 将 `templates/tsconfig.visuals.json` 落到 `buildOutDir/tsconfig.visuals.json`，
 * `include` 为组件文件 + shim（相对 buildOutDir 的路径）。
 */
export async function writeVisualsTsconfig(
  opts: WriteVisualsTsconfigOptions,
): Promise<VisualsTsconfigPaths> {
  const { buildOutDir, componentAbsPath } = opts;
  const shimAbs = opts.shimAbsPath ?? getDefaultShimPath();
  await mkdir(buildOutDir, { recursive: true });

  const templatePath = resolveTsconfigVisualsTemplatePath();
  const templateRaw = await readFile(templatePath, "utf8");
  const repoRoot = dirname(dirname(templatePath)).split("\\").join("/");

  const compRel = relative(buildOutDir, pathResolve(componentAbsPath))
    .split("\\")
    .join("/");
  const shimRel = relative(buildOutDir, pathResolve(shimAbs))
    .split("\\")
    .join("/");

  const jsonText = templateRaw
    .replaceAll("REPLACE_REPO_ROOT", repoRoot)
    .replace('"REPLACE_COMPONENT_GLOB"', JSON.stringify(compRel))
    .replace('"REPLACE_SHIM_PATH"', JSON.stringify(shimRel));

  const tsconfigPath = join(buildOutDir, "tsconfig.visuals.json");
  await writeFile(tsconfigPath, jsonText, "utf8");
  return { tsconfigPath, buildOutDir };
}

export interface ValidateStaticOptions extends RunIsolatedOptions {
  /**
   * 写入 `tsconfig.visuals.json` 的目录。默认使用临时目录（校验后删除），
   * 产物与 build out 对齐时可传 `./build/{slug}/`。
   */
  buildOutDir?: string;
  shimAbsPath?: string;
  /** 为 true 时不删除临时 `buildOutDir`（调试用） */
  keepTempDir?: boolean;
}

/**
 * AST 静态扫描后在隔离子进程中运行 `tsc -p tsconfig.visuals.json`（默认无网络）。
 */
export async function validateStatic(
  tsxPath: string,
  opts: ValidateStaticOptions = {},
): Promise<ValidateStaticResult> {
  const componentAbs = pathResolve(tsxPath);
  const scanned = await scanForbiddenImports(componentAbs);
  if (!scanned.ok) {
    return { ok: false, reason: "forbidden-import", message: scanned.message };
  }

  let ownTemp = false;
  let effectiveComponent = componentAbs;
  let buildOutDir = opts.buildOutDir;

  try {
    if (!buildOutDir) {
      ownTemp = true;
      buildOutDir = await mkdtemp(join(tmpdir(), "autovideo-visuals-tsc-"));
      const targetName = basename(componentAbs);
      const copyPath = join(buildOutDir, targetName || "Component.tsx");
      await copyFile(componentAbs, copyPath);
      effectiveComponent = copyPath;
    }

    const { tsconfigPath } = await writeVisualsTsconfig({
      buildOutDir: buildOutDir!,
      componentAbsPath: effectiveComponent,
      shimAbsPath: opts.shimAbsPath,
    });

    const { stdout, stderr, exitCode } = await runIsolated(
      process.execPath,
      [tscJsPath, "-p", tsconfigPath],
      {
        cwd: buildOutDir!,
        isolateNetwork: opts.isolateNetwork ?? true,
        timeoutMs: opts.timeoutMs ?? 120_000,
        memLimitBytes: opts.memLimitBytes,
        cpuLimitSec: opts.cpuLimitSec,
        env: opts.env,
        signal: opts.signal,
      },
    );

    if (exitCode !== 0) {
      const head = takeStderrHead(stderr + (stdout ? `\n${stdout}` : ""));
      return {
        ok: false,
        reason: "tsc",
        message:
          head.length > 0 ? head.join("\n") : `tsc 退出码 ${exitCode}`,
        tscStderrHead: head,
      };
    }

    return { ok: true };
  } finally {
    if (ownTemp && buildOutDir && !opts.keepTempDir) {
      await rm(buildOutDir, { recursive: true, force: true });
    }
  }
}

function isPureBlackOrWhite(r: number, g: number, b: number): boolean {
  return (
    (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
  );
}

/** 判定 PNG 是否「整幅几乎纯黑或纯白」。 */
export function pngBufferIsBlankSmoke(buffer: Buffer): boolean {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  if (width === 0 || height === 0) {
    return true;
  }
  let r0 = -1;
  let g0 = -1;
  let b0 = -1;
  let first = true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (first) {
        r0 = r;
        g0 = g;
        b0 = b;
        first = false;
      } else if (r !== r0 || g !== g0 || b !== b0) {
        return false;
      }
    }
  }
  return isPureBlackOrWhite(r0, g0, b0);
}

export interface ValidateRenderSmokeOptions extends ValidateStaticOptions {
  width?: number;
  height?: number;
  subtitleSafeBottom?: number;
}

/**
 * `tsc` 通过后 bundle 临时 Root，对中间帧 `renderStill`；像素全图同色且为黑或白则失败。
 */
export async function validateRenderSmoke(
  tsxPath: string,
  tempDurationSec: number,
  fps: number,
  opts: ValidateRenderSmokeOptions = {},
): Promise<ValidateRenderSmokeResult> {
  const componentAbs = pathResolve(tsxPath);

  const workDir = await mkdtemp(join(tmpdir(), "autovideo-visuals-smoke-"));
  const targetBasename = basename(componentAbs) || "Component.tsx";
  const targetPath = join(workDir, targetBasename);

  try {
    await copyFile(componentAbs, targetPath);

    const staticRes = await validateStatic(targetPath, {
      ...opts,
      buildOutDir: workDir,
    });
    if (!staticRes.ok) {
      return {
        ok: false,
        reason: staticRes.reason,
        message: staticRes.message,
        tscStderrHead: staticRes.tscStderrHead,
      };
    }

    const width = opts.width ?? 1920;
    const height = opts.height ?? 1080;
    const subtitleSafeBottom =
      opts.subtitleSafeBottom ?? Math.floor(height * 0.15);
    const durationInFrames = Math.max(1, Math.floor(tempDurationSec * fps));
    const frame = Math.min(
      durationInFrames - 1,
      Math.floor((tempDurationSec * fps) / 2),
    );

    const importStem = `./${targetBasename.replace(/\.tsx?$/i, "")}`;

    const generatedSource = `// @ts-nocheck
import React from "react";
import { useCurrentFrame } from "remotion";
import UserComp from ${JSON.stringify(importStem)};

const durationInFrames = ${durationInFrames};
const width = ${width};
const height = ${height};
const subtitleSafeBottom = ${subtitleSafeBottom};
const fps = ${fps};
const theme = ${JSON.stringify(getTheme("dark-code"))};

export default function Generated() {
  const frame = useCurrentFrame();
  return (
    <UserComp
      frame={frame}
      durationInFrames={durationInFrames}
      width={width}
      height={height}
      subtitleSafeBottom={subtitleSafeBottom}
      theme={theme}
      fps={fps}
    />
  );
}
`;

    const entrySource = `// @ts-nocheck
import React from "react";
import { Composition, registerRoot } from "remotion";
import Generated from "./Generated";

export const RemotionRoot = () => (
  <Composition
    id="VisualValidateSmoke"
    component={Generated}
    durationInFrames={${durationInFrames}}
    fps={${fps}}
    width={${width}}
    height={${height}}
  />
);

registerRoot(RemotionRoot);
`;

    await writeFile(join(workDir, "Generated.tsx"), generatedSource, "utf8");
    const entryFile = join(workDir, "smoke-entry.tsx");
    await writeFile(entryFile, entrySource, "utf8");

    const serveUrl = await bundle({
      entryPoint: entryFile,
      webpackOverride: (c) => c,
      rootDir: workDir,
      publicDir: null,
    });

    const composition = await selectComposition({
      serveUrl,
      id: "VisualValidateSmoke",
      inputProps: {},
    });

    const still = await renderStill({
      serveUrl,
      composition,
      frame,
      output: null,
      imageFormat: "png",
    });

    const buf = still.buffer;
    if (!buf || buf.length === 0) {
      return {
        ok: false,
        reason: "render",
        message: "renderStill 未返回 PNG buffer",
      };
    }

    if (pngBufferIsBlankSmoke(buf)) {
      return {
        ok: false,
        reason: "blank-frame",
        message: "单帧为纯黑或纯白，未通过冒烟检测",
      };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "render", message: msg };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

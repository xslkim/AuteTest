import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath, resolve as resolvePath } from "node:path";
import { loadResolvedCliConfig } from "../config/load.js";
import { parseMetaFile, type ParsedMeta } from "../parser/meta.js";
import { loadProjectFile } from "../parser/project.js";
import { parseBlockFiles } from "../parser/blocks.js";
import { parseNarrationLines } from "../parser/narration.js";
import { processVisualAssets } from "../parser/assets.js";
import {
  assertCompiledScript,
  scriptSchema,
  type CompiledScript,
} from "../types/script.js";
import { slugifyTitle } from "../util/slugify.js";
import type { MetaCliKey, MetaOverrideValue } from "../config/types.js";

export interface CompileCliOptions {
  argv: readonly string[];
  cwd: string;
}

function extractExtraFlags(argv: readonly string[]): {
  outFlag?: string;
  dryRun: boolean;
  verbose: boolean;
} {
  let outFlag: string | undefined;
  let dryRun = false;
  let verbose = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--out") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected path after --out");
      }
      outFlag = v;
      i++;
      continue;
    }
    if (a.startsWith("--out=")) {
      const sep = a.indexOf("=");
      outFlag = a.slice(sep + 1) || undefined;
      continue;
    }

    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--verbose") {
      verbose = true;
      continue;
    }
  }

  return { outFlag, dryRun, verbose };
}

const KNOWN_SUBCOMMANDS = new Set([
  "build",
  "compile",
  "tts",
  "visuals",
  "render",
  "preview",
  "cache",
  "doctor",
  "init",
]);

export function projectJsonPathFromArgv(argv: readonly string[]): string {
  const args = argv.slice(2).filter((x) => {
    if (x.startsWith("-")) return false;
    if (KNOWN_SUBCOMMANDS.has(x)) return false;
    return true;
  });
  const first = args[0];
  if (!first) {
    throw new Error("缺少 project.json 路径");
  }
  return first;
}

/**
 * `buildOutDirAbs`：资产复制与 script.json 的构建根目录（`--out` 或 `./build/{slug(title)}/`）。
 */
export function compileLoadedProjectToScript(input: {
  project: ReturnType<typeof loadProjectFile>;
  meta: ParsedMeta;
  buildOutDirAbs: string;
}): CompiledScript {
  const { project, meta, buildOutDirAbs } = input;

  const blocksMd = parseBlockFiles(project.blockPathsAbs);

  const assetInputs = blocksMd.map((b) => ({
    visualDescription: b.visualDescription,
    sourcePath: b.sourcePath,
  }));

  const { descriptions, assets } = processVisualAssets(
    assetInputs,
    project.projectRootDir,
    buildOutDirAbs,
  );

  const blocks = blocksMd.map((b, i) => {
    const lines = parseNarrationLines(b.narrationRaw);
    return {
      id: b.id,
      title: b.title,
      enter: b.enter,
      exit: b.exit,
      visual: { description: descriptions[i]! },
      narration: {
        lines,
        ...(b.explicitDurationSec !== undefined
          ? { explicitDurationSec: b.explicitDurationSec }
          : {}),
      },
    };
  });

  const compiledAt = new Date().toISOString();

  const script: CompiledScript = {
    meta: {
      schemaVersion: "1.0",
      title: meta.title,
      voiceRef: meta.voiceRef,
      aspect: meta.aspect,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      theme: meta.theme,
      subtitleSafeBottom: meta.subtitleSafeBottom,
    },
    blocks,
    artifacts: {
      compiledAt,
    },
    assets,
  };

  assertCompiledScript(script);
  scriptSchema.parse(script);

  return script;
}

export function compileProjectToScript(input: {
  projectJsonPath: string;
  cwd: string;
  metaOverrides?: Partial<Record<MetaCliKey, MetaOverrideValue>>;
  /** 若为相对路径，相对于 `cwd` */
  buildOutDirAbs: string;
}): {
  script: CompiledScript;
  buildOutDirAbs: string;
  project: ReturnType<typeof loadProjectFile>;
} {
  const { projectJsonPath, cwd, metaOverrides, buildOutDirAbs } = input;
  const project = loadProjectFile(projectJsonPath, cwd);
  const meta = parseMetaFile({
    metaMdPath: project.metaPathAbs,
    projectRootDir: project.projectRootDir,
    metaOverrides,
  });
  const script = compileLoadedProjectToScript({ project, meta, buildOutDirAbs });
  return { script, buildOutDirAbs, project };
}

export function resolveCompileBuildOutDir(
  cwd: string,
  meta: { title: string; slug?: string },
  outFlag: string | undefined,
): string {
  const slugSource = meta.slug?.trim() || meta.title;
  const slug = slugifyTitle(slugSource);
  if (outFlag !== undefined && outFlag.trim() !== "") {
    return resolvePath(cwd, outFlag);
  }
  return resolvePath(cwd, "build", slug);
}

/**
 * 解析 `build` / `compile` 共用的 `--out` 与 project.json，得到即将写入的构建根目录。
 */
export function resolveBuildOutDirFromProjectArgv(input: {
  argv: readonly string[];
  cwd: string;
  metaOverrides?: Partial<Record<MetaCliKey, MetaOverrideValue>>;
}): { buildOutDirAbs: string; projectJsonAbs: string } {
  const { argv, cwd, metaOverrides } = input;
  const { outFlag } = extractExtraFlags(argv);
  const relProject = projectJsonPathFromArgv(argv);
  const projectJsonAbs = resolvePath(cwd, relProject);
  const project = loadProjectFile(projectJsonAbs, cwd);
  const meta = parseMetaFile({
    metaMdPath: project.metaPathAbs,
    projectRootDir: project.projectRootDir,
    metaOverrides,
  });
  const buildOutDirAbs = resolveCompileBuildOutDir(cwd, meta, outFlag);
  return { buildOutDirAbs, projectJsonAbs };
}

function writeCompiledScript(script: CompiledScript, buildOutDirAbs: string): void {
  mkdirSync(resolvePath(buildOutDirAbs, "public"), { recursive: true });
  const rootJson = resolvePath(buildOutDirAbs, "script.json");
  const publicJson = resolvePath(buildOutDirAbs, "public", "script.json");
  const text = `${JSON.stringify(script, null, 2)}\n`;
  writeFileSync(rootJson, text, "utf8");
  writeFileSync(publicJson, text, "utf8");
}

export async function runCompileCommand(opts: CompileCliOptions): Promise<void> {
  const { cwd, argv } = opts;
  const { metaOverrides } = loadResolvedCliConfig({ argv, cwd });
  const { outFlag, dryRun, verbose } = extractExtraFlags(argv);
  const relProject = projectJsonPathFromArgv(argv);
  const projectJsonAbs = resolvePath(cwd, relProject);

  const project = loadProjectFile(projectJsonAbs, cwd);
  const meta = parseMetaFile({
    metaMdPath: project.metaPathAbs,
    projectRootDir: project.projectRootDir,
    metaOverrides,
  });
  const buildOutDirAbs = resolveCompileBuildOutDir(cwd, meta, outFlag);

  const effectiveWorkDir = dryRun
    ? mkdtempSync(joinPath(tmpdir(), "autovideo-compile-"))
    : buildOutDirAbs;

  try {
    const script = compileLoadedProjectToScript({
      project,
      meta,
      buildOutDirAbs: effectiveWorkDir,
    });

    if (verbose || dryRun) {
      const destRoot = resolvePath(buildOutDirAbs, "script.json");
      const destPublic = resolvePath(buildOutDirAbs, "public", "script.json");
      console.error(
        dryRun
          ? `[dry-run] 将写入 ${destRoot} 与 ${destPublic}（未写盘）`
          : `输出目录: ${buildOutDirAbs}`,
      );
    }

    if (dryRun) {
      return;
    }

    writeCompiledScript(script, buildOutDirAbs);
  } finally {
    if (dryRun) {
      rmSync(effectiveWorkDir, { recursive: true, force: true });
    }
  }
}
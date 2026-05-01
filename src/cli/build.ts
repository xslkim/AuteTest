import {
  extractConfigFlags,
  expandUserPath,
  loadResolvedCliConfig,
} from "../config/load.js";
import { resolveBuildOutDirFromProjectArgv, runCompileCommand } from "./compile.js";
import { runRenderCommand } from "./render.js";
import { runTtsCommand } from "./tts.js";
import { runVisualsCommand } from "./visuals.js";

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

export interface BuildCliOptions {
  argv: readonly string[];
  cwd: string;
}

function assertBuildRejectsBlockFlag(argv: readonly string[]): void {
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--block" || a === "--blocks") {
      throw new Error(
        "`autovideo build` 不支持 --block；局部重跑请使用分步命令，例如 `autovideo tts <script.json> --block B03 --force`、`autovideo render <script.json> --block B03 --force`。",
      );
    }
    if (a.startsWith("--block=")) {
      throw new Error(
        "`autovideo build` 不支持 --block；局部重跑请使用分步命令，例如 `autovideo render <script.json> --block B03 --force`。",
      );
    }
  }
}

/** 与 compile 的 `extractExtraFlags` 对齐：dry-run 时不写盘、不执行后续 stage。 */
function extractDryRunVerbose(argv: readonly string[]): { dryRun: boolean; verbose: boolean } {
  let dryRun = false;
  let verbose = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    if (a === "--verbose") verbose = true;
    if (
      a === "--out" ||
      a === "--config" ||
      a === "--cache-dir" ||
      a === "--meta"
    ) {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) i += 1;
    }
  }
  return { dryRun, verbose };
}

/** `script.json` 相对 `-C <build-out>`（与编译后进程的 cwd 约定一致）。 */
function rewriteArgvForStage(
  argv: readonly string[],
  stageCommand: string,
  scriptJsonRelFromBuildOutDir: string,
): string[] {
  const result: string[] = [];
  let seenSubcommand = false;
  let replacedProjectArg = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (i <= 1) {
      result.push(a);
      continue;
    }
    if (!seenSubcommand && KNOWN_SUBCOMMANDS.has(a)) {
      seenSubcommand = true;
      result.push(stageCommand);
      continue;
    }
    if (seenSubcommand && !replacedProjectArg && !a.startsWith("-")) {
      replacedProjectArg = true;
      result.push(scriptJsonRelFromBuildOutDir);
      continue;
    }
    result.push(a);
  }

  return result;
}

function absolutizeConfigPathsInArgv(
  argv: readonly string[],
  baseCwd: string,
): string[] {
  const { configPath, cacheDirFlag } = extractConfigFlags(argv);
  if (configPath === undefined && cacheDirFlag === undefined) {
    return [...argv];
  }

  const out = [...argv];
  for (let i = 2; i < out.length; i += 1) {
    const a = out[i];
    if ((a === "--config" || a === "--autovideo-config") && out[i + 1]) {
      const v = out[i + 1]!;
      out[i + 1] = expandUserPath(v, baseCwd);
      i += 1;
      continue;
    }
    if (a?.startsWith("--config=") || a?.startsWith("--autovideo-config=")) {
      const sep = a.indexOf("=");
      const v = a.slice(sep + 1);
      const key = a.slice(0, sep + 1);
      out[i] = `${key}${expandUserPath(v, baseCwd)}`;
      continue;
    }
    if (a === "--cache-dir" && out[i + 1]) {
      const v = out[i + 1]!;
      out[i + 1] = expandUserPath(v, baseCwd);
      i += 1;
      continue;
    }
    if (a?.startsWith("--cache-dir=")) {
      const sep = a.indexOf("=");
      const v = a.slice(sep + 1);
      out[i] = `--cache-dir=${expandUserPath(v, baseCwd)}`;
      continue;
    }
  }

  return out;
}

export async function runBuildCommand(opts: BuildCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  assertBuildRejectsBlockFlag(argv);

  const { metaOverrides } = loadResolvedCliConfig({ argv, cwd });
  const { dryRun, verbose } = extractDryRunVerbose(argv);
  const { buildOutDirAbs } = resolveBuildOutDirFromProjectArgv({
    argv,
    cwd,
    metaOverrides,
  });

  if (dryRun) {
    if (verbose) {
      console.error(
        `[dry-run] build → compile → tts → visuals → render；buildOutDir=${buildOutDirAbs}`,
      );
    } else {
      console.error("[dry-run] build：compile → tts → visuals → render（未执行）");
    }
    await runCompileCommand({ argv, cwd });
    return;
  }

  await runCompileCommand({ argv, cwd });

  /** 相对 build-out 的根 `script.json`（见 §10 cwd）；子 stage 均以 `cwd=buildOutDirAbs` 解析路径。 */
  const scriptRel = "script.json";
  const argvForStages = absolutizeConfigPathsInArgv(argv, cwd);

  await runTtsCommand({
    argv: rewriteArgvForStage(argvForStages, "tts", scriptRel),
    cwd: buildOutDirAbs,
  });

  await runVisualsCommand({
    argv: rewriteArgvForStage(argvForStages, "visuals", scriptRel),
    cwd: buildOutDirAbs,
  });

  await runRenderCommand({
    argv: rewriteArgvForStage(argvForStages, "render", scriptRel),
    cwd: buildOutDirAbs,
  });
}

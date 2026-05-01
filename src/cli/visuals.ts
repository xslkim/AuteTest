import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pLimit from "p-limit";

import type { ComponentManifestKeyFields } from "../cache/store.js";
import { computeComponentCacheBundle } from "../ai/component-cache-key.js";
import { generateComponentTsx } from "../ai/component-gen.js";
import { readComponentPromptMd5Prefix } from "../ai/prompt-version.js";
import {
  validateRenderSmoke,
  validateStatic,
  type ValidateRenderSmokeResult,
  type ValidateStaticResult,
} from "../ai/validate.js";
import { getTheme } from "../../remotion/engine/theme.js";
import type { Theme } from "../types/script.js";
import { CacheStore } from "../cache/store.js";
import { loadResolvedCliConfig } from "../config/load.js";
import {
  assertCompiledScript,
  parseScriptJson,
  type CompiledScript,
} from "../types/script.js";

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

export interface VisualsCliOptions {
  argv: readonly string[];
  cwd: string;
}

function isFlagArg(a: string): boolean {
  return a.startsWith("-");
}

function extractVisualsArgvMeta(argv: readonly string[]): {
  scriptPath: string;
  blockIds: Set<string> | null;
  force: boolean;
  verbose: boolean;
  dryRun: boolean;
} {
  let blockIds: Set<string> | null = null;
  let force = false;
  let verbose = false;
  let dryRun = false;

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--block" || a === "--blocks") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected id list after --block");
      }
      blockIds = new Set(
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
      continue;
    }
    if (a.startsWith("--block=")) {
      const raw = a.slice("--block=".length);
      blockIds = new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }

    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--verbose") {
      verbose = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (a === "--config" || a === "--cache-dir" || a === "--meta" || a === "--out") {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        i += 1;
      }
      continue;
    }
    if (a.startsWith("--config=") || a.startsWith("--cache-dir=") || a.startsWith("--meta=")) {
      continue;
    }
  }

  const pos: string[] = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (isFlagArg(a)) {
      if (
        a === "--config" ||
        a === "--cache-dir" ||
        a === "--meta" ||
        a === "--block" ||
        a === "--blocks"
      ) {
        i += 1;
      }
      continue;
    }
    if (KNOWN_SUBCOMMANDS.has(a)) continue;
    pos.push(a);
  }

  const scriptPath = pos[0];
  if (!scriptPath) {
    throw new Error("缺少 script.json 路径");
  }

  return { scriptPath, blockIds, force, verbose, dryRun };
}

function appendLog(buildOutDir: string, line: string): void {
  const dir = path.join(buildOutDir, "logs");
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const logFile = path.join(dir, `visuals-${day}.log`);
  appendFileSync(logFile, `${new Date().toISOString()}\t${line}\n`, "utf8");
}

/** 与 validate smoke 及宿主 theme 模块对齐（名称取自 script.meta.theme）。 */
function themeJsonForPrompt(themeName: string): Theme {
  try {
    return getTheme(themeName);
  } catch {
    return { ...getTheme("dark-code"), name: themeName };
  }
}

async function buildSystemPrompt(themeName: string): Promise<string> {
  const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ai", "prompts");
  const mdPath = path.join(promptsDir, "component.md");
  const md = await readFile(mdPath, "utf8");
  const themeJson = JSON.stringify(themeJsonForPrompt(themeName), null, 2);
  return `${md}\n\n---\n\n## 本次运行的 theme JSON（已由宿主注入）\n\n\`\`\`json\n${themeJson}\n\`\`\`\n`;
}

function posixJoin(...parts: string[]): string {
  return parts.join("/").replace(/\\/g, "/");
}

function componentDestRel(blockId: string): string {
  return posixJoin("src", "blocks", blockId, "Component.tsx");
}

function takeLines(lines: readonly string[], max: number): string[] {
  return lines.slice(0, max);
}

/** stderr / message 前 50 行 — PRD §6.3 */
function stderrHeadText(text: string, maxLines = 50): string {
  const raw = text.split(/\r?\n/).filter((l) => l.length > 0);
  return takeLines(raw, maxLines).join("\n");
}

/** 尝试从 tsc 输出解析首个报错行号 `(line,col): error` */
function firstTscErrorLine(stderrHead: string[]): number | undefined {
  const joined = stderrHead.join("\n");
  const m = /\((\d+),\d+\):\s*error\s/i.exec(joined);
  if (m) {
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function snippetAroundLine(source: string, line1Based: number, context = 5): string {
  const lines = source.split(/\r?\n/);
  const idx = line1Based - 1;
  if (idx < 0 || idx >= lines.length) {
    return source;
  }
  const lo = Math.max(0, idx - context);
  const hi = Math.min(lines.length, idx + context + 1);
  const slice = lines.slice(lo, hi);
  return slice
    .map((ln, i) => `${String(lo + i + 1).padStart(5, " ")} | ${ln}`)
    .join("\n");
}

function formatValidateFailure(params: {
  round: number;
  tsx: string;
  res: Exclude<ValidateStaticResult | ValidateRenderSmokeResult, { ok: true }>;
}): string {
  const { round, tsx, res } = params;
  let detail = "";
  if (res.reason === "tsc" && res.tscStderrHead?.length) {
    const head = res.tscStderrHead;
    detail += `### TypeScript（stderr 前 ${String(head.length)} 行）\n\n\`\`\`\n${head.join("\n")}\n\`\`\`\n\n`;
    const lineNo = firstTscErrorLine(head);
    if (lineNo !== undefined) {
      detail += `### 报错附近源码（±5 行，第 ${String(lineNo)} 行）\n\n\`\`\`tsx\n${snippetAroundLine(tsx, lineNo)}\n\`\`\`\n\n`;
    }
  } else {
    detail += `### 错误说明\n\n${res.message}\n\n`;
    if (res.reason === "render" || res.reason === "blank-frame") {
      detail += `### 当前组件完整源码\n\n\`\`\`tsx\n${tsx}\n\`\`\`\n\n`;
    }
  }

  return [
    `你是 AutoVideo 组件修复助手（第 ${String(round)} 轮校验失败）。`,
    "",
    "上一次生成的组件未通过校验，请在保持 **system prompt 契约** 的前提下输出修正后的完整 TSX（仍将通过 render_component 工具返回）。",
    "",
    "**约束**：仅允许 `react` / `remotion` 的静态 import；`AnimationProps` / `Theme` 由校验 shim **全局提供**，不要 import `./animation-types`。",
    "",
    detail,
    "请修复问题并返回完整 TSX 源码（单一 default export React 组件）。",
  ].join("\n");
}

export async function runVisualsCommand(opts: VisualsCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  const { config } = loadResolvedCliConfig({ argv, cwd });
  const { scriptPath: _relScript, blockIds, force, verbose, dryRun } =
    extractVisualsArgvMeta(argv);
  const relScript = path.normalize(_relScript);

  const scriptAbs = path.resolve(cwd, relScript);
  const buildOutDir = path.dirname(scriptAbs);

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(readFileSync(scriptAbs, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`无法解析 script.json：${e instanceof Error ? e.message : String(e)}`);
  }

  const parsedWide = parseScriptJson(rawParsed);
  assertCompiledScript(parsedWide);
  const script = parsedWide as CompiledScript;

  const blocksToProcess = script.blocks.filter((b) => {
    if (blockIds === null) return true;
    return blockIds.has(b.id);
  });

  if (blocksToProcess.length === 0) {
    throw new Error(
      blockIds === null
        ? "script 中没有块"
        : `没有匹配的块：${[...blockIds].join(", ")}`,
    );
  }

  if (dryRun) {
    const msg = `[dry-run] visuals：${String(blocksToProcess.length)} 块；将写入 src/blocks/B**/Component.tsx、更新 script.json.visual.componentPath`;
    console.error(msg);
    if (verbose) {
      console.error(`[dry-run] buildOutDir=${buildOutDir} cache=${config.resolvedCacheDir}`);
    }
    return;
  }

  const promptVersion = await readComponentPromptMd5Prefix();
  const systemPromptBase = await buildSystemPrompt(script.meta.theme);

  const store = new CacheStore({
    cacheDir: config.resolvedCacheDir,
    maxSizeGB: config.cache.maxSizeGB,
  });
  await store.ensureLayout();
  await store.evictIfOverLimit({
    triggerStageStart: config.cache.evictTrigger === "stage-start",
  });

  const globalAbort = new AbortController();
  const tmpRoot = path.join(buildOutDir, ".tmp-visuals");
  mkdirSync(tmpRoot, { recursive: true });

  try {
    const claudeModel = config.anthropic.model;

    type BlockJob = {
      block: CompiledScript["blocks"][number];
      forceMiss: boolean;
      cacheKeyHex: string;
      manifestKey: ComponentManifestKeyFields;
    };

    const jobs: BlockJob[] = blocksToProcess.map((block) => ({
      block,
      forceMiss: force && (blockIds === null || blockIds.has(block.id)),
      ...computeComponentCacheBundle({
        theme: script.meta.theme,
        width: script.meta.width,
        height: script.meta.height,
        promptVersion,
        claudeModel,
        visualDescription: block.visual.description,
      }),
    }));

    const limit = pLimit(Math.max(1, config.anthropic.concurrency));
    const satisfiedByCache = new Set<string>();

    await Promise.all(
      jobs.map((job) =>
        limit(async () => {
          if (globalAbort.signal.aborted) return;
          if (job.forceMiss) return;
          const hit = await store.get("component", job.cacheKeyHex);
          if (!hit) return;
          const destRel = componentDestRel(job.block.id);
          const destAbs = path.join(buildOutDir, ...destRel.split("/"));
          await mkdir(path.dirname(destAbs), { recursive: true });
          copyFileSync(hit, destAbs);
          job.block.visual = { ...job.block.visual, componentPath: destRel };
          satisfiedByCache.add(job.block.id);
          if (verbose) {
            console.error(`visuals：${job.block.id} cache hit`);
          }
        }),
      ),
    );

    /** 顺序生成：首块彻底失败则不启动后续需生成的块（TASKS 验收）。 */
    for (const job of jobs) {
      if (globalAbort.signal.aborted) {
        throw new Error("visuals 已取消");
      }

      const { block, cacheKeyHex, manifestKey } = job;
      const destRel = componentDestRel(block.id);
      const destAbs = path.join(buildOutDir, ...destRel.split("/"));

      if (!job.forceMiss && satisfiedByCache.has(block.id)) {
        continue;
      }

      let tsxContent: string | undefined;

      let userMessage =
        [
          "## 当前块上下文",
          "",
          `- blockId: ${block.id}`,
          `- title: ${block.title}`,
          `- canvas: ${String(script.meta.width)}×${String(script.meta.height)} px`,
          `- fps: ${String(script.meta.fps)}`,
          `- subtitleSafeBottom: ${String(script.meta.subtitleSafeBottom)} px`,
          "",
          "## Visual 描述（请据此生成组件）",
          "",
          block.visual.description.trim(),
          "",
        ].join("\n");

      let lastTsx = "";
      let lastFailure:
        | Exclude<ValidateStaticResult | ValidateRenderSmokeResult, { ok: true }>
        | undefined;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (globalAbort.signal.aborted) {
          throw new Error("visuals 已取消");
        }

        const gen = await generateComponentTsx({
          config,
          systemPrompt: systemPromptBase,
          userMessage,
          signal: globalAbort.signal,
        });

        lastTsx = gen.tsx;
        const tmpTsx = path.join(tmpRoot, `${block.id}-attempt-${String(attempt)}.tsx`);
        writeFileSync(tmpTsx, lastTsx, "utf8");

        const staticRes = await validateStatic(tmpTsx, {
          buildOutDir,
          signal: globalAbort.signal,
        });

        if (!staticRes.ok) {
          lastFailure = staticRes;
          if (attempt < 3) {
            userMessage = formatValidateFailure({
              round: attempt,
              tsx: lastTsx,
              res: staticRes,
            });
          }
          continue;
        }

        const tempDur = block.audio?.durationSec ?? 5;
        const renderRes = await validateRenderSmoke(tmpTsx, tempDur, script.meta.fps, {
          width: script.meta.width,
          height: script.meta.height,
          subtitleSafeBottom: script.meta.subtitleSafeBottom,
          buildOutDir,
          signal: globalAbort.signal,
        });

        if (!renderRes.ok) {
          lastFailure = renderRes;
          if (attempt < 3) {
            userMessage = formatValidateFailure({
              round: attempt,
              tsx: lastTsx,
              res: renderRes,
            });
          }
          continue;
        }

        tsxContent = lastTsx;
        break;
      }

      if (tsxContent === undefined) {
        const detail =
          lastFailure !== undefined
            ? `${lastFailure.reason}: ${stderrHeadText(lastFailure.message)}`
            : "未知校验错误";
        appendLog(buildOutDir, `FAIL\tblock=${block.id}\t${detail}`);
        globalAbort.abort();
        throw new Error(`块 ${block.id} 经过 3 轮生成与校验仍失败：${detail}`);
      }

      await mkdir(path.dirname(destAbs), { recursive: true });
      writeFileSync(destAbs, tsxContent, "utf8");

      const putTmp = path.join(tmpRoot, `${block.id}-final.tsx`);
      writeFileSync(putTmp, tsxContent, "utf8");
      await store.put("component", cacheKeyHex, putTmp, manifestKey);

      block.visual = { ...block.visual, componentPath: destRel };

      if (verbose) {
        console.error(`visuals：${block.id} 已写入 ${destRel}`);
      }
    }

    script.artifacts.visualsGeneratedAt = new Date().toISOString();

    const outText = `${JSON.stringify(script, null, 2)}\n`;
    writeFileSync(scriptAbs, outText, "utf8");
    mkdirSync(path.join(buildOutDir, "public"), { recursive: true });
    writeFileSync(path.join(buildOutDir, "public", "script.json"), outText, "utf8");

    if (verbose) {
      console.error("visuals：全部完成");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ids = blocksToProcess.map((b) => b.id).join(",");
    console.error(`\n✗ visuals 失败：${msg}\n`);
    console.error(
      `Resume after fixing the issue:\n  autovideo visuals ${relScript} --block ${ids} --force\n`,
    );
    throw e;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CacheStore } from "../cache/store.js";
import { loadResolvedCliConfig } from "../config/load.js";
import { concatPartials } from "../render/concat.js";
import { normalizeFinalWithLoudnorm } from "../render/loudnorm.js";
import { validateFinalNormalizedVideo } from "../render/qa.js";
import { renderBlockPartials, readRemotionRendererVersion } from "../render/render-blocks.js";
import { applyTimingsToBlocks } from "../render/timing.js";
import {
  assertRenderInputScript,
  type RenderInputScript,
  type Script,
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

export interface RenderCliOptions {
  argv: readonly string[];
  cwd: string;
}

function isFlagArg(a: string): boolean {
  return a.startsWith("-");
}

function extractRenderArgvMeta(argv: readonly string[]): {
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
  const logFile = path.join(dir, `render-${day}.log`);
  appendFileSync(logFile, `${new Date().toISOString()}\t${line}\n`, "utf8");
}

function parseRenderInputScript(raw: string): RenderInputScript {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch (e) {
    throw new Error(
      `无法解析 script.json：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  assertRenderInputScript(data);
  return data;
}

export async function runRenderCommand(opts: RenderCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  const { config } = loadResolvedCliConfig({ argv, cwd });
  const { scriptPath: _relScript, blockIds, force, verbose, dryRun } =
    extractRenderArgvMeta(argv);
  const relScript = path.normalize(_relScript);

  const scriptAbs = path.resolve(cwd, relScript);
  const buildOutDirAbs = path.dirname(scriptAbs);
  const scriptText = readFileSync(scriptAbs, "utf8");
  const script = parseRenderInputScript(scriptText) as Script;

  if (blockIds !== null) {
    const unknown = [...blockIds].filter((id) => !script.blocks.some((b) => b.id === id));
    if (unknown.length > 0) {
      throw new Error(`没有匹配的块：${unknown.join(", ")}`);
    }
  }

  if (dryRun) {
    const only =
      blockIds === null ? "全部块" : `--block ${[...blockIds].sort().join(",")}`;
    console.error(
      `[dry-run] render：${only}；timing → public/script.json → partials → concat → loudnorm → QA`,
    );
    if (verbose) {
      console.error(`[dry-run] buildOutDir=${buildOutDirAbs} cache=${config.resolvedCacheDir}`);
    }
    return;
  }

  applyTimingsToBlocks(script.blocks, {
    fps: script.meta.fps,
    minHoldSec: config.render.minHoldSec,
    defaultEnterSec: config.render.defaultEnterSec,
    defaultExitSec: config.render.defaultExitSec,
  });

  script.artifacts.renderedAt = new Date().toISOString();
  writeFileSync(scriptAbs, `${JSON.stringify(script, null, 2)}\n`, "utf8");

  const store = new CacheStore({
    cacheDir: config.resolvedCacheDir,
    maxSizeGB: config.cache.maxSizeGB,
  });
  await store.ensureLayout();

  const remotionVersion = readRemotionRendererVersion();

  const forcePartialAll = force && blockIds === null;
  const forcePartialBlockIds =
    force && blockIds !== null ? blockIds : null;

  await renderBlockPartials({
    script,
    buildOutDirAbs,
    cacheStore: store,
    remotionVersion,
    render: config.render,
    cacheEvictOnStageStart: config.cache.evictTrigger === "stage-start",
    forcePartialAll,
    forcePartialBlockIds,
    renderOnlyBlockIds: blockIds,
    verbose,
  });

  const partialPathsAbs = script.blocks.map((b) =>
    path.join(buildOutDirAbs, "output", "partials", `${b.id}.mp4`),
  );

  await concatPartials({
    partialPathsAbs,
    buildOutDirAbs,
  });

  const finalPathAbs = path.join(buildOutDirAbs, "output", "final.mp4");
  const normalizedPathAbs = path.join(buildOutDirAbs, "output", "final_normalized.mp4");

  await normalizeFinalWithLoudnorm({
    finalPathAbs,
    outputPathAbs: normalizedPathAbs,
    loudnorm: config.render.loudnorm,
  });

  validateFinalNormalizedVideo({
    finalPathAbs: normalizedPathAbs,
    width: script.meta.width,
    height: script.meta.height,
    blocks: script.blocks,
    fps: script.meta.fps,
  });

  writeFileSync(scriptAbs, `${JSON.stringify(script, null, 2)}\n`, "utf8");

  appendLog(buildOutDirAbs, `OK\tblocks=${script.blocks.map((b) => b.id).join(",")}`);
}

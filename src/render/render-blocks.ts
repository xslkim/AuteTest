import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";

import pLimit from "p-limit";

import type { CacheStore } from "../cache/store.js";
import type { RenderSection } from "../config/types.js";
import type { Block, Script } from "../types/script.js";
import { generateRemotionBlockImportsTs } from "./block-imports.js";
import { computePartialCacheBundle } from "./partial-cache-key.js";
import { generateRenderRootTsx } from "./root-render.js";
import { applyTimingsToBlocks } from "./timing.js";

const require = createRequire(import.meta.url);

export function readRemotionRendererVersion(): string {
  const pkgPath = path.join(
    path.dirname(require.resolve("@remotion/renderer/package.json")),
    "package.json",
  );
  const raw = readFileSync(pkgPath, "utf8");
  const ver = (JSON.parse(raw) as { version?: string }).version;
  if (typeof ver !== "string" || ver.length === 0) {
    throw new Error("readRemotionRendererVersion: missing @remotion/renderer version");
  }
  return ver;
}

export interface RenderBlocksOptions {
  script: Script;
  /** build out 目录绝对路径（cwd 约定） */
  buildOutDirAbs: string;
  cacheStore: CacheStore;
  remotionVersion: string;
  render: RenderSection;
  /** `cache.evictTrigger === "stage-start"` 时为 true */
  cacheEvictOnStageStart: boolean;
  /** 不带 `--block` 时与 `--force` 组合：全部块强制 partial cache miss */
  forcePartialAll?: boolean;
  /** `--block` 与 `--force` 组合：仅这些块强制 partial cache miss */
  forcePartialBlockIds?: ReadonlySet<string> | null;
  /** 仅渲染这些块（其它块跳过 Remotion，保留磁盘上已有 partial） */
  renderOnlyBlockIds?: ReadonlySet<string> | null;
  verbose?: boolean;
}

function posixRel(parts: string[]): string {
  return path.posix.join(...parts);
}

function resolveAutovideoRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
      if (pkg.name === "autovideo") {
        return dir;
      }
    } catch {
      /* not readable */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("resolveAutovideoRepoRoot: could not find autovideo package.json");
}

/** remotion-root 内 import：相对 `remotion/VideoComposition`（无扩展名）。 */
function blockCompositionImportSpecifier(rootTsxAbs: string, repoRootAbs: string): string {
  const absTarget = path.join(repoRootAbs, "remotion", "VideoComposition");
  let rel = path.relative(path.dirname(rootTsxAbs), absTarget).split(path.sep).join("/");
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

async function renderMediaOnceWithRetry(
  args: Parameters<typeof renderMedia>[0],
): Promise<void> {
  try {
    await renderMedia(args);
  } catch {
    await renderMedia(args);
  }
}

/**
 * PRD §6.4 step 4 — 单次 bundle、按块 partial 缓存、块级 `p-limit` + `renderMedia` concurrency。
 * 失败：每块 1 次重试；仍失败则 `cancel` 其它 in-flight。
 */
export async function renderBlockPartials(options: RenderBlocksOptions): Promise<void> {
  const {
    script,
    buildOutDirAbs,
    cacheStore,
    remotionVersion,
    render,
    cacheEvictOnStageStart,
    forcePartialAll = false,
    forcePartialBlockIds = null,
    renderOnlyBlockIds = null,
    verbose = false,
  } = options;

  await cacheStore.evictIfOverLimit({ triggerStageStart: cacheEvictOnStageStart });

  if (script.blocks.some((b) => b.timing == null)) {
    applyTimingsToBlocks(script.blocks, {
      fps: script.meta.fps,
      minHoldSec: render.minHoldSec,
      defaultEnterSec: render.defaultEnterSec,
      defaultExitSec: render.defaultExitSec,
    });
  }

  const publicDir = path.join(buildOutDirAbs, "public");
  await mkdir(publicDir, { recursive: true });
  await mkdir(path.join(buildOutDirAbs, "output", "partials"), { recursive: true });

  await writeFile(
    path.join(publicDir, "script.json"),
    `${JSON.stringify(script, null, 2)}\n`,
    "utf8",
  );

  const repoRoot = resolveAutovideoRepoRoot();

  const importsDir = path.join(buildOutDirAbs, "src");
  await mkdir(importsDir, { recursive: true });
  await writeFile(
    path.join(importsDir, "remotion-block-imports.ts"),
    generateRemotionBlockImportsTs(script, {
      importsFileDirAbs: importsDir,
      repoRootAbs: repoRoot,
    }),
    "utf8",
  );

  const rootTsxPath = path.join(buildOutDirAbs, "remotion-root.tsx");

  const { cancelSignal, cancel } = makeCancelSignal();
  let aborted = false;
  const failAll = (err: Error): never => {
    if (!aborted) {
      aborted = true;
      cancel();
    }
    throw err;
  };

  const blockCompImport = blockCompositionImportSpecifier(rootTsxPath, repoRoot);
  await writeFile(
    rootTsxPath,
    generateRenderRootTsx(script, { blockCompositionImportPath: blockCompImport }),
    "utf8",
  );
  const publicDirRel = path.relative(repoRoot, publicDir);

  let serveUrl: string;
  try {
    serveUrl = await bundle({
      entryPoint: rootTsxPath,
      rootDir: repoRoot,
      publicDir: publicDirRel,
      webpackOverride: (c) => ({
        ...c,
        resolve: {
          ...c.resolve,
          extensionAlias: {
            ...((c.resolve as { extensionAlias?: Record<string, string[]> })?.extensionAlias),
            ".js": [".ts", ".tsx", ".js"],
          },
          alias: {
            ...(typeof c.resolve?.alias === "object" &&
            c.resolve.alias !== null &&
            !Array.isArray(c.resolve.alias)
              ? c.resolve.alias
              : {}),
            "@autovideo-block-imports": path.join(
              buildOutDirAbs,
              "src",
              "remotion-block-imports.ts",
            ),
          },
        },
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Remotion bundle failed: ${msg}`);
  }

  if (verbose) {
    console.error(`[render-blocks] bundle serveUrl: ${serveUrl}`);
  }

  const blockLimit = pLimit(Math.max(1, render.blockConcurrency));
  const framesConc =
    render.framesConcurrencyPerBlock ??
    Math.max(1, Math.floor(os.cpus().length / Math.max(1, render.blockConcurrency)));

  const browserExecutable = render.browser ?? undefined;

  const runOne = async (block: Block): Promise<void> => {
    if (aborted) {
      throw new Error("render cancelled due to failure in another block");
    }

    const partialRel = posixRel(["output", "partials", `${block.id}.mp4`]);
    const partialAbs = path.join(buildOutDirAbs, "output", "partials", `${block.id}.mp4`);

    if (renderOnlyBlockIds != null && !renderOnlyBlockIds.has(block.id)) {
      if (!existsSync(partialAbs)) {
        failAll(
          new Error(
            `missing partial for skipped block ${block.id}: ${partialRel}\nResume: autovideo render <script.json> --block ${block.id} --force`,
          ),
        );
      }
      block.render = { partialPath: partialRel, cacheHit: true };
      if (verbose) {
        console.error(`[render-blocks] ${block.id} skipped (--block), reuse existing ${partialRel}`);
      }
      return;
    }

    const { cacheKeyHex, manifestKey } = computePartialCacheBundle({
      block,
      scriptTheme: script.meta.theme,
      width: script.meta.width,
      height: script.meta.height,
      fps: script.meta.fps,
      buildOutDirAbs,
      remotionVersion,
    });

    const forceThisPartial =
      forcePartialAll ||
      (forcePartialBlockIds != null && forcePartialBlockIds.has(block.id));

    if (!forceThisPartial) {
      const cached = await cacheStore.get("partial", cacheKeyHex);
      if (cached != null) {
        await mkdir(path.dirname(partialAbs), { recursive: true });
        await copyFile(cached, partialAbs);
        block.render = { partialPath: partialRel, cacheHit: true };
        if (verbose) {
          console.error(`[render-blocks] ${block.id} cache hit → ${partialRel}`);
        }
        return;
      }
    }

    if (verbose) {
      console.error(
        `[render-blocks] ${block.id} cache miss, renderMedia (framesConcurrency=${framesConc})`,
      );
    }

    let composition!: Awaited<ReturnType<typeof selectComposition>>;
    try {
      composition = await selectComposition({
        serveUrl,
        id: "Block",
        inputProps: { blockId: block.id },
        browserExecutable,
      });
    } catch (e) {
      if (aborted) {
        throw new Error("render cancelled due to failure in another block");
      }
      const msg = e instanceof Error ? e.message : String(e);
      failAll(
        new Error(
          `selectComposition failed for block ${block.id}: ${msg}\nResume: autovideo render <script.json> --block ${block.id} --force`,
        ),
      );
    }

    try {
      await mkdir(path.dirname(partialAbs), { recursive: true });
      await renderMediaOnceWithRetry({
        serveUrl,
        composition,
        inputProps: { blockId: block.id },
        codec: "h264",
        outputLocation: partialAbs,
        concurrency: framesConc,
        overwrite: true,
        cancelSignal,
        browserExecutable,
      });
    } catch (e) {
      if (aborted) {
        throw new Error("render cancelled due to failure in another block");
      }
      const msg = e instanceof Error ? e.message : String(e);
      failAll(
        new Error(
          `renderMedia failed for block ${block.id} after retry: ${msg}\nResume: autovideo render <script.json> --block ${block.id} --force`,
        ),
      );
    }

    await cacheStore.put("partial", cacheKeyHex, partialAbs, manifestKey);
    block.render = { partialPath: partialRel, cacheHit: false };
  };

  try {
    await Promise.all(script.blocks.map((b) => blockLimit(() => runOne(b))));
  } catch (e) {
    if (!aborted) {
      cancel();
    }
    throw e;
  }
}

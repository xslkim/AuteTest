import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadResolvedCliConfig } from "../config/load.js";
import { generatePreviewRootTsx } from "../preview/root-preview.js";
import { generateRemotionBlockImportsTs } from "../render/block-imports.js";
import { scriptSchema, type Script } from "../types/script.js";

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

export interface PreviewCliOptions {
  argv: readonly string[];
  cwd: string;
}

function isFlagArg(a: string): boolean {
  return a.startsWith("-");
}

function parsePreviewArgv(argv: readonly string[]): {
  scriptPath: string;
  blockId: string | null;
  port: number | null;
  verbose: boolean;
  dryRun: boolean;
} {
  let blockId: string | null = null;
  let port: number | null = null;
  let verbose = false;
  let dryRun = false;

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--block" || a === "--blocks") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected id after --block");
      }
      const ids = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length !== 1) {
        throw new Error("preview 仅支持单个块：`--block B03`");
      }
      blockId = ids[0] ?? null;
      i += 1;
      continue;
    }
    if (a.startsWith("--block=")) {
      const raw = a.slice("--block=".length);
      const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length !== 1) {
        throw new Error("preview 仅支持单个块：`--block B03`");
      }
      blockId = ids[0] ?? null;
      continue;
    }

    if (a === "--port") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected port number after --port");
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        throw new Error(`invalid port: ${v}`);
      }
      port = n;
      i += 1;
      continue;
    }
    if (a.startsWith("--port=")) {
      const raw = a.slice("--port=".length);
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        throw new Error(`invalid port: ${raw}`);
      }
      port = n;
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
        a === "--blocks" ||
        a === "--port"
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

  return { scriptPath, blockId, port, verbose, dryRun };
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

/** remotion-root-preview.tsx → remotion/VideoComposition（无扩展名）。 */
function blockCompositionImportSpecifier(rootTsxAbs: string, repoRootAbs: string): string {
  const absTarget = path.join(repoRootAbs, "remotion", "VideoComposition");
  let rel = path.relative(path.dirname(rootTsxAbs), absTarget).split(path.sep).join("/");
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

function parsePreviewScript(raw: string): Script {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch (e) {
    throw new Error(
      `无法解析 script.json：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return scriptSchema.parse(data);
}

function resolveRemotionCliJs(repoRootAbs: string): string {
  const p = path.join(repoRootAbs, "node_modules", "@remotion", "cli", "remotion-cli.js");
  if (!existsSync(p)) {
    throw new Error(`找不到 Remotion CLI：${p}`);
  }
  return p;
}

export async function runPreviewCommand(opts: PreviewCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  loadResolvedCliConfig({ argv, cwd });

  const { scriptPath: _relScript, blockId, port, verbose, dryRun } = parsePreviewArgv(argv);
  const relScript = path.normalize(_relScript);
  const scriptAbs = path.resolve(cwd, relScript);
  const buildOutDirAbs = path.dirname(scriptAbs);

  const scriptText = readFileSync(scriptAbs, "utf8");
  const script = parsePreviewScript(scriptText);

  if (blockId !== null && !script.blocks.some((b) => b.id === blockId)) {
    throw new Error(`没有匹配的块：${blockId}`);
  }

  const repoRootAbs = resolveAutovideoRepoRoot();

  const importsDir = path.join(buildOutDirAbs, "src");
  mkdirSync(importsDir, { recursive: true });
  mkdirSync(path.join(buildOutDirAbs, "public"), { recursive: true });

  writeFileSync(
    path.join(importsDir, "remotion-block-imports.ts"),
    generateRemotionBlockImportsTs(script, {
      importsFileDirAbs: importsDir,
      repoRootAbs,
    }),
    "utf8",
  );

  const previewRootPath = path.join(buildOutDirAbs, "remotion-root-preview.tsx");
  const blockCompImport = blockCompositionImportSpecifier(previewRootPath, repoRootAbs);
  writeFileSync(
    previewRootPath,
    generatePreviewRootTsx(script, {
      blockCompositionImportPath: blockCompImport,
      blockLoadersImportPath: "./src/remotion-block-imports",
    }),
    "utf8",
  );

  writeFileSync(
    path.join(buildOutDirAbs, "public", "script.json"),
    `${JSON.stringify(script, null, 2)}\n`,
    "utf8",
  );

  /** `--block` 时需固定端口才能在启动后打开直达 URL；未指定时用 3333 */
  const studioPort = port ?? (blockId !== null ? 3333 : null);

  const studioArgs = ["studio", previewRootPath];
  if (studioPort !== null) {
    studioArgs.push(`--port=${studioPort}`);
  }
  studioArgs.push("--no-open");

  const baseUrl =
    studioPort !== null ? `http://localhost:${studioPort}` : "http://localhost:<studio-port>";

  let targetPath: string | null =
    blockId !== null ? `/${encodeURIComponent(blockId)}` : null;

  if (dryRun) {
    console.error(
      `[dry-run] preview：写入 ${path.relative(cwd, previewRootPath)}；将启动 Remotion Studio`,
    );
    if (verbose) {
      console.error(`[dry-run] ${studioArgs.join(" ")}`);
      console.error(`[dry-run] cwd=${buildOutDirAbs}`);
      console.error(`[dry-run] AUTVIDEO_REMOTION_ENTRY=${previewRootPath}`);
    }
    if (targetPath !== null) {
      console.error(`[dry-run] 打开 ${baseUrl}${targetPath} 定位到块 ${blockId}`);
    }
    return;
  }

  const remotionCliJs = resolveRemotionCliJs(repoRootAbs);

  if (verbose) {
    console.error(`[preview] cwd=${buildOutDirAbs}`);
    console.error(`[preview] node ${remotionCliJs} ${studioArgs.join(" ")}`);
    if (targetPath !== null) {
      console.error(`[preview] 请在浏览器打开 ${baseUrl}${targetPath}`);
    }
  }

  const openUrlLater =
    blockId !== null && studioPort !== null ? `${baseUrl}${targetPath}` : null;

  const child = spawn(process.execPath, [remotionCliJs, ...studioArgs], {
    cwd: buildOutDirAbs,
    stdio: "inherit",
    env: {
      ...process.env,
      AUTVIDEO_REMOTION_ENTRY: "remotion-root-preview.tsx",
    },
  });

  if (openUrlLater !== null && process.env.AUTVIDEO_PREVIEW_OPEN !== "0") {
    setTimeout(() => {
      const opener = spawn("xdg-open", [openUrlLater], {
        detached: true,
        stdio: "ignore",
      });
      opener.unref();
      opener.on("error", () => {
        console.error(`请手动在浏览器打开：${openUrlLater}`);
      });
    }, 2500);
  } else if (blockId !== null && studioPort === null) {
    console.error(
      `已选择块 ${blockId}，但未绑定固定端口；请在 Studio 启动后在地址栏追加路径 /${encodeURIComponent(blockId)}`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal != null) {
        reject(new Error(`Remotion Studio 被信号终止：${signal}`));
        return;
      }
      if (code !== 0 && code !== null) {
        reject(new Error(`Remotion Studio 退出码 ${code}`));
        return;
      }
      resolve();
    });
  });
}

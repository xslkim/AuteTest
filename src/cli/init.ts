import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export interface InitCliOptions {
  argv: readonly string[];
  cwd: string;
}

function resolveAutovideoRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
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
  throw new Error("init: 未找到 autovideo 仓库根目录（缺少 name 为 autovideo 的 package.json）");
}

function parseInitArgv(argv: readonly string[]): {
  targetDirRaw: string;
  force: boolean;
} {
  let force = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a.startsWith("-")) {
      throw new Error(`init: 未知选项 ${a}`);
    }
  }

  const pos: string[] = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("-")) continue;
    if (KNOWN_SUBCOMMANDS.has(a)) continue;
    pos.push(a);
  }

  const targetDirRaw = pos[0];
  if (!targetDirRaw) {
    throw new Error("用法: autovideo init <dir> [--force]");
  }

  return { targetDirRaw, force };
}

const starterRequiredRel = [
  "project.json",
  "meta.md",
  "script.md",
  "README.md",
  "autovideo.config.json",
  "hero.png",
] as const;

function assertStarterLooksValid(starterAbs: string): void {
  for (const rel of starterRequiredRel) {
    const p = path.join(starterAbs, rel);
    if (!existsSync(p) || !statSync(p).isFile()) {
      throw new Error(`init: 模板不完整，缺少文件: ${rel}`);
    }
  }
}

/** 将 `templates/starter` 复制到目标目录。 */
export function runInitCommand(options: InitCliOptions): void {
  const { targetDirRaw, force } = parseInitArgv(options.argv);
  const targetAbs = path.resolve(options.cwd, targetDirRaw);

  const repoRoot = resolveAutovideoRepoRoot();
  const starterAbs = path.join(repoRoot, "templates", "starter");
  assertStarterLooksValid(starterAbs);

  if (existsSync(targetAbs)) {
    const st = statSync(targetAbs);
    if (!st.isDirectory()) {
      throw new Error(`init: 目标已存在且不是目录: ${targetAbs}`);
    }
    const entries = [...new Set([...starterRequiredRel].map((r) => path.basename(r)))];
    const hasAny = entries.some((name) => existsSync(path.join(targetAbs, name)));
    if (hasAny && !force) {
      throw new Error(
        `init: 目录非空或已含模板文件；若需覆盖请先删除或使用 autovideo init "${targetDirRaw}" --force`,
      );
    }
  } else {
    mkdirSync(targetAbs, { recursive: true });
  }

  cpSync(starterAbs, targetAbs, { recursive: true, force });
}

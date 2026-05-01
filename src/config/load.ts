import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve as resolvePath } from "node:path";
import { DEFAULT_AUTOVIDEO_CONFIG } from "./defaults.js";
import type {
  AutovideoRawConfig,
  MetaCliKey,
  MetaOverrideValue,
  ResolvedAutovideoConfig,
} from "./types.js";
import { META_CLI_KEYS } from "./types.js";

const META_CLI_KEY_SET = new Set<string>(META_CLI_KEYS);

export interface LoadConfigInput {
  /** 完整 `process.argv`，含 `execPath`/`node`、脚本路径等皆可；仅扫描其中的 flag。 */
  argv: readonly string[];
  /** 解析相对路径、查找项目根 `autovideo.config.json` 所用的当前工作目录 */
  cwd: string;
}

export interface LoadedCliConfig {
  config: ResolvedAutovideoConfig;
  /** `--meta key=value` 解析结果；只允许 §3.4 顶层 meta 字段 */
  metaOverrides: Partial<Record<MetaCliKey, MetaOverrideValue>>;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cloneConfig(base: Readonly<AutovideoRawConfig>): AutovideoRawConfig {
  return {
    voxcpm: { ...base.voxcpm },
    anthropic: { ...base.anthropic },
    render: {
      ...base.render,
      loudnorm: { ...base.render.loudnorm },
    },
    cache: { ...base.cache },
  };
}

function deepMergeSection<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!isPlainRecord(patch)) {
    return base;
  }
  const out = { ...base };
  for (const [k, pv] of Object.entries(patch)) {
    if (!(k in base)) continue;
    const bk = base[k];
    if (isPlainRecord(bk) && isPlainRecord(pv)) {
      (out as Record<string, unknown>)[k] = deepMergeSection(bk, pv);
    } else {
      (out as Record<string, unknown>)[k] = pv;
    }
  }
  return out;
}

export function mergeAutovideoConfig(
  base: AutovideoRawConfig,
  patch: unknown,
): AutovideoRawConfig {
  const b = cloneConfig(base);
  if (!isPlainRecord(patch)) {
    return b;
  }
  return {
    voxcpm: deepMergeSection(
      { ...b.voxcpm } as Record<string, unknown>,
      patch.voxcpm,
    ) as unknown as AutovideoRawConfig["voxcpm"],
    anthropic: deepMergeSection(
      { ...b.anthropic } as Record<string, unknown>,
      patch.anthropic,
    ) as unknown as AutovideoRawConfig["anthropic"],
    render: deepMergeSection(
      { ...b.render, loudnorm: { ...b.render.loudnorm } } as Record<string, unknown>,
      patch.render,
    ) as unknown as AutovideoRawConfig["render"],
    cache: deepMergeSection(
      { ...b.cache } as Record<string, unknown>,
      patch.cache,
    ) as unknown as AutovideoRawConfig["cache"],
  };
}

/** `~` → `os.homedir()`；相对路径相对于 `cwd`。 */
export function expandUserPath(input: string, cwd: string): string {
  if (input === "~") {
    return homedir();
  }
  if (input.startsWith("~/")) {
    return join(homedir(), input.slice(2));
  }
  if (input.startsWith("~\\")) {
    return join(homedir(), input.slice(2));
  }
  if (isAbsolute(input)) {
    return input;
  }
  return resolvePath(cwd, input);
}

function readOptionalJson(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as unknown;
}

/** 从扁平 argv 中提取 `--config` / `--cache-dir` / `--meta`（不写回 argv）。 */
export function extractConfigFlags(argv: readonly string[]): {
  configPath?: string;
  cacheDirFlag?: string;
  metaPairs: string[];
} {
  const metaPairs: string[] = [];
  let configPath: string | undefined;
  let cacheDirFlag: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--config" || a === "--autovideo-config") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected path after --config");
      }
      configPath = v;
      i++;
      continue;
    }
    if (a.startsWith("--config=") || a.startsWith("--autovideo-config=")) {
      const sep = a.indexOf("=");
      configPath = a.slice(sep + 1) || undefined;
      continue;
    }

    if (a === "--cache-dir") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected path after --cache-dir");
      }
      cacheDirFlag = v;
      i++;
      continue;
    }
    if (a.startsWith("--cache-dir=")) {
      const sep = a.indexOf("=");
      cacheDirFlag = a.slice(sep + 1) || undefined;
      continue;
    }

    if (a === "--meta") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected key=value after --meta");
      }
      metaPairs.push(v);
      i++;
      continue;
    }
    if (a.startsWith("--meta=")) {
      const sep = a.indexOf("=");
      const v = a.slice(sep + 1);
      if (!v) {
        throw new Error("expected key=value after --meta=");
      }
      metaPairs.push(v);
      continue;
    }
  }

  return { configPath, cacheDirFlag, metaPairs };
}

export function coerceMetaValue(raw: string): MetaOverrideValue {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t);
  return t;
}

/** 校验 key 且无点号段；返回值写入 metaOverrides */
export function parseMetaPair(pair: string): {
  key: MetaCliKey;
  value: MetaOverrideValue;
} {
  const eq = pair.indexOf("=");
  if (eq <= 0) {
    throw new Error(
      `--meta 需要 key=value 形式，收到 ${JSON.stringify(pair)}`,
    );
  }
  const key = pair.slice(0, eq).trim();
  const valueRaw = pair.slice(eq + 1);

  if (key.includes(".")) {
    throw new Error(
      `--meta 不支持点号嵌套字段，只允许顶层字段；收到 ${JSON.stringify(key)}`,
    );
  }
  if (!META_CLI_KEY_SET.has(key)) {
    throw new Error(
      `--meta 只允许顶层 meta 字段（${META_CLI_KEYS.join(", ")}）；收到 ${JSON.stringify(key)}`,
    );
  }

  const value = coerceMetaValue(valueRaw);
  if (key === "fps") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`--meta fps 必须为整数，收到 ${JSON.stringify(pair)}`);
    }
  }

  return { key: key as MetaCliKey, value };
}

export function loadResolvedCliConfig(input: LoadConfigInput): LoadedCliConfig {
  const { argv, cwd } = input;
  const flags = extractConfigFlags(argv);

  let merged = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {});

  const rootCfg = join(cwd, "autovideo.config.json");
  if (existsSync(rootCfg)) {
    merged = mergeAutovideoConfig(merged, readOptionalJson(rootCfg));
  }

  if (flags.configPath) {
    const abs = expandUserPath(flags.configPath, cwd);
    merged = mergeAutovideoConfig(merged, readOptionalJson(abs));
  }

  const metaOverrides: Partial<Record<MetaCliKey, MetaOverrideValue>> = {};
  for (const p of flags.metaPairs) {
    const { key, value } = parseMetaPair(p);
    metaOverrides[key] = value;
  }

  if (flags.cacheDirFlag !== undefined) {
    merged = mergeAutovideoConfig(merged, {
      cache: { dir: flags.cacheDirFlag },
    });
  }

  const resolvedCacheDir = expandUserPath(merged.cache.dir, cwd);

  const config: ResolvedAutovideoConfig = {
    ...merged,
    voxcpm: {
      ...merged.voxcpm,
      modelDir: expandUserPath(merged.voxcpm.modelDir, cwd),
    },
    anthropic: { ...merged.anthropic },
    render: {
      ...merged.render,
      loudnorm: { ...merged.render.loudnorm },
      browser:
        merged.render.browser === null
          ? null
          : expandUserPath(merged.render.browser, cwd),
    },
    cache: { ...merged.cache },
    resolvedCacheDir,
  };

  return { config, metaOverrides };
}

export type LoadedCliInput = LoadConfigInput;

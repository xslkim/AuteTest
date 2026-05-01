/** PRD §9 — 单层配置 JSON（路径字段可含 `~`，合并后再展开）。 */

export interface LoudnormSection {
  i: number;
  tp: number;
  lra: number;
  twoPass: boolean;
  audioBitrate: string;
}

export interface VoxcpmSection {
  endpoint: string;
  modelDir: string;
  autoStart: boolean;
  cfgValue: number;
  inferenceTimesteps: number;
  denoise: boolean;
  retryBadcase: boolean;
  concurrency: number;
}

export interface AnthropicSection {
  apiKeyEnv: string;
  model: string;
  promptCaching: boolean;
  maxRetries: number;
  concurrency: number;
}

export interface RenderSection {
  blockConcurrency: number;
  framesConcurrencyPerBlock: number | null;
  browser: string | null;
  minHoldSec: number;
  defaultEnterSec: number;
  defaultExitSec: number;
  loudnorm: LoudnormSection;
}

export interface CacheSection {
  dir: string;
  maxSizeGB: number;
  evictTrigger: "stage-start" | "manual";
}

export interface AutovideoRawConfig {
  voxcpm: VoxcpmSection;
  anthropic: AnthropicSection;
  render: RenderSection;
  cache: CacheSection;
}

/** PRD §3.4 / §7 — 允许 `--meta` 覆盖的顶层 meta 字段。 */
export const META_CLI_KEYS = [
  "title",
  "voiceRef",
  "aspect",
  "theme",
  "fps",
] as const;

export type MetaCliKey = (typeof META_CLI_KEYS)[number];

export type MetaOverrideValue = string | number | boolean;

/** 与环境解析后的路径字段（POSIX 语义由调用方保证）。 */
export interface ResolvedAutovideoConfig extends AutovideoRawConfig {
  /** 合并并展开 `~`/相对路径后的缓存根目录绝对路径 */
  resolvedCacheDir: string;
}

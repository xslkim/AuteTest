import type {
  AnthropicSection,
  AutovideoRawConfig,
  CacheSection,
  RenderSection,
  VoxcpmSection,
} from "./types.js";

/** PRD §9 — 配置文件完整默认值（与 `autovideo.config.json` 结构一致）。 */
export const DEFAULT_VOXCPM: Readonly<VoxcpmSection> = {
  endpoint: "http://127.0.0.1:8000",
  modelDir: "~/.cache/voxcpm/VoxCPM2",
  autoStart: true,
  cfgValue: 2.0,
  inferenceTimesteps: 10,
  denoise: false,
  retryBadcase: true,
  concurrency: 4,
};

export const DEFAULT_ANTHROPIC: Readonly<AnthropicSection> = {
  apiKeyEnv: "ANTHROPIC_API_KEY",
  model: "claude-sonnet-4-6",
  promptCaching: true,
  maxRetries: 3,
  concurrency: 4,
};

export const DEFAULT_RENDER: Readonly<RenderSection> = {
  blockConcurrency: 4,
  framesConcurrencyPerBlock: null,
  browser: null,
  minHoldSec: 1.5,
  defaultEnterSec: 0.5,
  defaultExitSec: 0.3,
  loudnorm: {
    i: -16,
    tp: -1.5,
    lra: 11,
    twoPass: true,
    audioBitrate: "192k",
  },
};

export const DEFAULT_CACHE: Readonly<CacheSection> = {
  dir: "~/.autovideo/cache",
  maxSizeGB: 20,
  evictTrigger: "stage-start",
};

export const DEFAULT_AUTOVIDEO_CONFIG: Readonly<AutovideoRawConfig> = {
  voxcpm: { ...DEFAULT_VOXCPM },
  anthropic: { ...DEFAULT_ANTHROPIC },
  render: {
    ...DEFAULT_RENDER,
    loudnorm: { ...DEFAULT_RENDER.loudnorm },
  },
  cache: { ...DEFAULT_CACHE },
};

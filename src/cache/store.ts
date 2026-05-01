/**
 * PRD §11 — Global cache backing store with manifest locking and LRU eviction.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import msFn from "ms";

const require = createRequire(import.meta.url);
const properLockfile = require("proper-lockfile") as typeof import("proper-lockfile");

export type CacheArtifactType = "audio" | "component" | "partial";

/** PRD §11.5 — `"30d"` / `"12h"` style; throws if invalid */
export function parseOlderThanMs(duration: string): number {
  const n = msFn(duration);
  if (typeof n !== "number") {
    throw new Error(`Invalid --older-than duration: ${duration}`);
  }
  return n;
}

export type AudioManifestKeyFields = {
  ttsText: string;
  voiceRefHash: string;
  cfgValue: number;
  inferenceTimesteps: number;
  denoise: boolean;
  voxcpmModelVersion: string;
};

export type ComponentManifestKeyFields = {
  descriptionHash: string;
  theme: string;
  width: number;
  height: number;
  promptVersion: string;
  assetHashesJson: string;
  claudeModel: string;
};

export type PartialManifestKeyFields = {
  componentHash: string;
  audioHash: string;
  theme: string;
  width: number;
  height: number;
  fps: number;
  enter: string;
  exit: string;
  remotionVersion: string;
};

export type CacheKeyMetadata =
  | AudioManifestKeyFields
  | ComponentManifestKeyFields
  | PartialManifestKeyFields;

export interface CacheManifestEntry {
  type: CacheArtifactType;
  /** POSIX path relative to cache root */
  file: string;
  key: CacheKeyMetadata;
  createdAt: string;
  lastHitAt: string;
  hitCount: number;
}

export type ManifestData = Record<string, CacheManifestEntry>;

export interface CacheStoreStatsEntry {
  count: number;
  bytesOnDisk: number;
  hitsTotal: number;
}

export interface CacheStoreStats {
  totalEntries: number;
  totalBytesOnDisk: number;
  /** aggregate hit counters from manifest entries */
  hitCountByType: Record<CacheArtifactType, CacheStoreStatsEntry>;
}

export interface CleanCacheOptions {
  type?: CacheArtifactType;
  /** delete entries whose lastHitAt is older than `Date.now() - olderThanMs` */
  olderThanMs?: number;
  /** when present, delete entries for which this returns true */
  stale?: (entry: CacheManifestEntry) => boolean;
}

export interface EvictIfOverLimitOptions {
  /**
   * When false, skip eviction (use for compile stage — PRD §11.4 `evictTrigger`).
   * Callers pass `config.cache.evictTrigger === "stage-start"` for tts/visuals/render.
   */
  triggerStageStart?: boolean;
}

const TYPE_SUBDIR: Record<CacheArtifactType, string> = {
  audio: "audio",
  component: "components",
  partial: "partials",
};

const TYPE_EXT: Record<CacheArtifactType, string> = {
  audio: ".wav",
  component: ".tsx",
  partial: ".mp4",
};

const EVICT_ORDER: CacheArtifactType[] = ["partial", "component", "audio"];

function manifestId(type: CacheArtifactType, key: string): string {
  return `${type}:${key}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CacheStoreOptions {
  /** Resolved absolute cache root path */
  cacheDir: string;
  maxSizeGB: number;
}

export class CacheStore {
  readonly cacheDir: string;
  readonly maxSizeGB: number;

  private readonly manifestPath: string;

  constructor(options: CacheStoreOptions) {
    this.cacheDir = path.resolve(options.cacheDir);
    this.maxSizeGB = options.maxSizeGB;
    this.manifestPath = path.join(this.cacheDir, "manifest.json");
  }

  /** PRD §11.1 — ensure layout exists */
  async ensureLayout(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    for (const sub of Object.values(TYPE_SUBDIR)) {
      await fs.mkdir(path.join(this.cacheDir, sub), { recursive: true });
    }
    try {
      await fs.access(this.manifestPath);
    } catch {
      await fs.writeFile(this.manifestPath, "{}\n", "utf8");
    }
  }

  /**
   * Returns absolute path to cached file, or null.
   * On hit, updates `lastHitAt` and `hitCount` in the manifest.
   */
  async get(type: CacheArtifactType, key: string): Promise<string | null> {
    await this.ensureLayout();
    const id = manifestId(type, key);
    return this.withManifest(async (data) => {
      const entry = data[id];
      if (!entry || entry.type !== type) {
        return { data, result: null as string | null };
      }
      const abs = path.join(this.cacheDir, entry.file);
      try {
        await fs.access(abs);
      } catch {
        delete data[id];
        return { data, result: null };
      }
      entry.lastHitAt = nowIso();
      entry.hitCount += 1;
      return { data, result: abs };
    });
  }

  /**
   * Copies `sourceFile` into the cache under `{type}/{key}{ext}` and registers manifest entry.
   * `key` is the hash string without the `audio:` / `component:` / `partial:` prefix.
   */
  async put(
    type: CacheArtifactType,
    key: string,
    sourceFile: string,
    keyMetadata: CacheKeyMetadata,
  ): Promise<string> {
    await this.ensureLayout();
    const id = manifestId(type, key);
    const sub = TYPE_SUBDIR[type];
    const ext = TYPE_EXT[type];
    const rel = path.posix.join(sub, `${key}${ext}`);
    const destAbs = path.join(this.cacheDir, rel);

    return this.withManifest(async (data) => {
      await fs.copyFile(sourceFile, destAbs);
      const t = nowIso();
      data[id] = {
        type,
        file: rel.replace(/\\/g, "/"),
        key: keyMetadata,
        createdAt: t,
        lastHitAt: t,
        hitCount: 0,
      };
      return { data, result: destAbs };
    });
  }

  async stats(): Promise<CacheStoreStats> {
    await this.ensureLayout();
    const data = await this.readManifestUnlocked();
    const hitCountByType: Record<CacheArtifactType, CacheStoreStatsEntry> = {
      audio: { count: 0, bytesOnDisk: 0, hitsTotal: 0 },
      component: { count: 0, bytesOnDisk: 0, hitsTotal: 0 },
      partial: { count: 0, bytesOnDisk: 0, hitsTotal: 0 },
    };
    let totalBytes = 0;
    for (const entry of Object.values(data)) {
      const abs = path.join(this.cacheDir, entry.file);
      let size = 0;
      try {
        const st = await fs.stat(abs);
        size = st.size;
      } catch {
        /* missing file */
      }
      totalBytes += size;
      const b = hitCountByType[entry.type];
      b.count += 1;
      b.bytesOnDisk += size;
      b.hitsTotal += entry.hitCount;
    }
    return {
      totalEntries: Object.keys(data).length,
      totalBytesOnDisk: totalBytes,
      hitCountByType,
    };
  }

  /**
   * Remove entries (and files) matching filters. Multiple filters are AND-combined.
   */
  async clean(opts: CleanCacheOptions = {}): Promise<number> {
    await this.ensureLayout();
    const { type, olderThanMs, stale } = opts;
    const cutoff = olderThanMs != null ? Date.now() - olderThanMs : null;

    return this.withManifest(async (data) => {
      let removed = 0;
      for (const [id, entry] of Object.entries(data)) {
        if (type != null && entry.type !== type) continue;
        if (cutoff != null) {
          const hit = Date.parse(entry.lastHitAt);
          if (!Number.isFinite(hit) || hit > cutoff) continue;
        }
        if (stale != null && !stale(entry)) continue;
        const abs = path.join(this.cacheDir, entry.file);
        try {
          await fs.unlink(abs);
        } catch {
          /* already gone */
        }
        delete data[id];
        removed += 1;
      }
      return { data, result: removed };
    });
  }

  /**
   * PRD §11.4 — If total stored bytes exceed `maxSizeGB`, evict by tier (partial → component → audio)
   * and within tier by `lastHitAt` ascending (LRU).
   */
  async evictIfOverLimit(options: EvictIfOverLimitOptions = {}): Promise<number> {
    const { triggerStageStart = true } = options;
    if (!triggerStageStart) return 0;

    await this.ensureLayout();
    const limit = this.maxSizeGB * 1024 ** 3;
    if (!Number.isFinite(limit) || limit <= 0) return 0;

    let evicted = 0;
    // Loop: recompute size after each removal batch might need multiple passes
    for (;;) {
      const data = await this.readManifestUnlocked();
      const total = await this.sumManifestFileBytes(data);
      if (total <= limit) break;

      const toRemove = this.pickEvictionCandidate(data);
      if (!toRemove) break;

      await this.withManifest(async (mut) => {
        const entry = mut[toRemove];
        if (!entry) return { data: mut, result: 0 };
        const abs = path.join(this.cacheDir, entry.file);
        try {
          await fs.unlink(abs);
        } catch {
          /* */
        }
        delete mut[toRemove];
        return { data: mut, result: 1 };
      });
      evicted += 1;
      if (evicted > 10_000) break; // safety
    }
    return evicted;
  }

  private pickEvictionCandidate(data: ManifestData): string | null {
    const entries = Object.entries(data);
    if (entries.length === 0) return null;

    for (const tier of EVICT_ORDER) {
      const tierEntries = entries.filter(([, e]) => e.type === tier);
      if (tierEntries.length === 0) continue;
      tierEntries.sort((a, b) => {
        const ta = Date.parse(a[1].lastHitAt);
        const tb = Date.parse(b[1].lastHitAt);
        const sa = Number.isFinite(ta) ? ta : 0;
        const sb = Number.isFinite(tb) ? tb : 0;
        if (sa !== sb) return sa - sb;
        return a[0].localeCompare(b[0]);
      });
      return tierEntries[0]![0];
    }
    return null;
  }

  private async sumManifestFileBytes(data: ManifestData): Promise<number> {
    let sum = 0;
    for (const entry of Object.values(data)) {
      const abs = path.join(this.cacheDir, entry.file);
      try {
        sum += (await fs.stat(abs)).size;
      } catch {
        /* */
      }
    }
    return sum;
  }

  private async readManifestUnlocked(): Promise<ManifestData> {
    try {
      const raw = await fs.readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as ManifestData;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private async withManifest<T>(
    fn: (data: ManifestData) => Promise<{ data: ManifestData; result: T }>,
  ): Promise<T> {
    await this.ensureLayout();
    const release = await properLockfile.lock(this.manifestPath, {
      stale: 60_000,
      retries: { retries: 30, minTimeout: 50, maxTimeout: 500 },
    });
    try {
      const data = await this.readManifestUnlocked();
      const { data: next, result } = await fn(data);
      await fs.writeFile(this.manifestPath, JSON.stringify(next, null, 2) + "\n", "utf8");
      return result;
    } finally {
      await release();
    }
  }
}

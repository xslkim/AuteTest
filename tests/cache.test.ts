import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CacheStore,
  parseOlderThanMs,
  type ComponentManifestKeyFields,
} from "../src/cache/store.js";
import { runCacheCommand } from "../src/cli/cache.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import { mergeAutovideoConfig } from "../src/config/load.js";

async function rimraf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

describe("CacheStore", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rimraf(root);
  });

  it("put then get hits; different key misses", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-", String(Date.now()));
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 20 });
    await store.ensureLayout();
    const src = path.join(root, "_src.wav");
    await fs.writeFile(src, "fake-wav-body");
    await store.put("audio", "abc123dead", src, {
      ttsText: "hello",
      voiceRefHash: "v1",
      cfgValue: 2,
      inferenceTimesteps: 10,
      denoise: false,
      voxcpmModelVersion: "mv1",
    });

    const hit = await store.get("audio", "abc123dead");
    expect(hit).not.toBeNull();
    expect(await fs.readFile(hit!, "utf8")).toBe("fake-wav-body");

    const miss = await store.get("audio", "different");
    expect(miss).toBeNull();

    await store.evictIfOverLimit({ triggerStageStart: false });
  });

  it("concurrent put from spawned workers does not corrupt manifest", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-concurrent-", String(Date.now()));
    await fs.mkdir(root, { recursive: true });

    const tsx = path.join(import.meta.dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");
    const worker = path.join(import.meta.dirname, "cache-worker-put.ts");
    const workers = ["a", "b", "c", "d"];
    const codes = workers.map((s) =>
      spawnSync(process.execPath, [tsx, worker, root, s], {
        cwd: path.join(import.meta.dirname, ".."),
      }),
    );
    expect(codes.every((r) => r.status === 0)).toBe(true);

    const manifestRaw = await fs.readFile(path.join(root, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    const keys = Object.keys(manifest);
    expect(keys.length).toBe(4);

    const store = new CacheStore({ cacheDir: root, maxSizeGB: 20 });
    for (const s of workers) {
      const p = await store.get("audio", `concurrent_${s}`);
      expect(p).not.toBeNull();
      const body = await fs.readFile(p!, "utf8");
      expect(body).toContain(`wav-${s}-`);
    }
  });

  it("evicts partial before component before audio when over limit", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-evict-", String(Date.now()));
    await fs.mkdir(root, { recursive: true });

    /** touch file at rel path */
    async function mk(rel: string, bytes: number): Promise<void> {
      const dir = path.join(root, path.dirname(rel));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(root, rel), Buffer.alloc(bytes, 1));
    }

    async function manifestWith(files: Record<string, { rel: string; type: keyof typeof manifests }>): Promise<void> {
      const m: Record<string, unknown> = {};
      const iso = ["2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z", "2026-05-01T12:00:00.000Z"];
      let i = 0;
      for (const [id, meta] of Object.entries(files)) {
        const ts = iso[i % iso.length];
        i += 1;
        m[`${meta.type}:${id}`] = {
          type: meta.type,
          file: meta.rel.replace(/\\/g, "/"),
          key: manifests[meta.type](id),
          createdAt: ts,
          lastHitAt: ts,
          hitCount: 0,
        };
      }
      await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(m) + "\n", "utf8");
    }

    const manifests = {
      audio: (id: string) =>
        ({
          ttsText: id,
          voiceRefHash: "h",
          cfgValue: 1,
          inferenceTimesteps: 1,
          denoise: false,
          voxcpmModelVersion: "mv",
        }) as const,
      component: (id: string) =>
        ({
          descriptionHash: id,
          theme: "t",
          width: 1,
          height: 1,
          promptVersion: "p",
          assetHashesJson: "[]",
          claudeModel: "m",
        }) satisfies ComponentManifestKeyFields,
      partial: (id: string) =>
        ({
          componentHash: "c",
          audioHash: "a",
          theme: "t",
          width: 1,
          height: 1,
          fps: 30,
          enter: "fade",
          exit: "fade",
          remotionVersion: "4",
        }) as const,
    };

    // partial (oldest LRU among partials): 600 bytes; newest partial 601 so we skip it first round
    await mk("partials/p-old.mp4", 600);
    await mk("partials/p-new.mp4", 601);
    // component newest at 599 — should survive until partials gone
    await mk("components/c.wav.tsx", 599);
    // audio 598
    await mk("audio/a.wav", 598);

    await manifestWith({
      pold: { rel: "partials/p-old.mp4", type: "partial" },
      pnew: { rel: "partials/p-new.mp4", type: "partial" },
      comp: { rel: "components/c.wav.tsx", type: "component" },
      aud: { rel: "audio/a.wav", type: "audio" },
      // same lastHitAt order: p-old first alphabetically/id order - we tie-break by candidate sort;
      // pickEvictionCandidate sorts partials by lastHitAt then key.
    });

    // Make p-old strictly older LRU than p-new
    const mf = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")) as Record<
      string,
      { lastHitAt: string }
    >;
    mf["partial:pold"].lastHitAt = "2026-05-01T09:00:00.000Z";
    mf["partial:pnew"].lastHitAt = "2026-05-01T12:00:00.000Z";
    mf["component:comp"].lastHitAt = "2026-05-01T12:30:00.000Z";
    mf["audio:aud"].lastHitAt = "2026-05-01T12:31:00.000Z";
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(mf, null, 2), "utf8");

    /** total 2398 bytes; limit 500 bytes forces partial → partial → component → audio */
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 500 / 1024 ** 3 });

    const evicted = await store.evictIfOverLimit({ triggerStageStart: true });
    expect(evicted).toBe(4);

    await expect(fs.access(path.join(root, "partials/p-old.mp4"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "partials/p-new.mp4"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "components/c.wav.tsx"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "audio/a.wav"))).rejects.toThrow();

    const leftover = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
    expect(Object.keys(leftover).length).toBe(0);
  });

  it("eviction within partial tier prefers older lastHitAt", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-evict-lru-", String(Date.now()));
    await fs.mkdir(root, { recursive: true });

    async function mk(rel: string, bytes: number): Promise<void> {
      const dir = path.join(root, path.dirname(rel));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(root, rel), Buffer.alloc(bytes, 1));
    }

    await mk("partials/a.mp4", 500);
    await mk("partials/b.mp4", 500);
    const partialKey = () =>
      ({
        componentHash: "c",
        audioHash: "a",
        theme: "t",
        width: 1,
        height: 1,
        fps: 30,
        enter: "fade",
        exit: "fade",
        remotionVersion: "4",
      }) as const;

    const manifest: Record<string, unknown> = {
      "partial:ka": {
        type: "partial",
        file: "partials/a.mp4",
        key: partialKey(),
        createdAt: "2026-05-01T10:00:00.000Z",
        lastHitAt: "2026-05-01T10:00:00.000Z",
        hitCount: 0,
      },
      "partial:kb": {
        type: "partial",
        file: "partials/b.mp4",
        key: partialKey(),
        createdAt: "2026-05-01T10:00:00.000Z",
        lastHitAt: "2026-05-01T11:00:00.000Z",
        hitCount: 0,
      },
    };
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest), "utf8");

    /** total 1000 bytes; evict one 500-byte oldest partial */
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 500 / 1024 ** 3 });
    await store.evictIfOverLimit({ triggerStageStart: true });

    await expect(fs.access(path.join(root, "partials/a.mp4"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "partials/b.mp4"))).resolves.toBeUndefined();
    const mf = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
    expect(Object.keys(mf)).toEqual(["partial:kb"]);
  });

  it("clean respects --older-than (ms parsing) and --stale predicate", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-clean-", String(Date.now()));
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 20 });
    await store.ensureLayout();

    const src = path.join(root, "s.wav");
    await fs.writeFile(src, "x");
    await store.put("audio", "oldhit", src, {
      ttsText: "a",
      voiceRefHash: "h",
      cfgValue: 1,
      inferenceTimesteps: 1,
      denoise: false,
      voxcpmModelVersion: "mv",
    });

    // patch lastHitAt to the past (direct manifest edit unlocked path - simulate old entry)
    const manifestPath = path.join(root, "manifest.json");
    const data = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
      string,
      { lastHitAt?: string }
    >;
    for (const e of Object.values(data)) {
      e.lastHitAt = "2020-01-01T00:00:00.000Z";
    }
    await fs.writeFile(manifestPath, JSON.stringify(data), "utf8");

    const thirtyDaysMs = parseOlderThanMs("30d");
    const removed = await store.clean({ olderThanMs: thirtyDaysMs });
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await store.get("audio", "oldhit")).toBeNull();

    await fs.writeFile(src, "y");
    await store.put("component", "stale1", src, {
      descriptionHash: "d",
      theme: "dark",
      width: 1,
      height: 1,
      promptVersion: "pv999",
      assetHashesJson: "[]",
      claudeModel: "claude",
    });
    await store.put("component", "keepMe", src, {
      descriptionHash: "d2",
      theme: "dark",
      width: 1,
      height: 1,
      promptVersion: "keepme",
      assetHashesJson: "[]",
      claudeModel: "claude",
    });

    await store.clean({
      stale: (entry) =>
        entry.type === "component" &&
        (entry.key as ComponentManifestKeyFields).promptVersion === "pv999",
    });
    expect(await store.get("component", "stale1")).toBeNull();
    expect(await store.get("component", "keepMe")).not.toBeNull();

    await store.put("partial", "prm", src, {
      componentHash: "c",
      audioHash: "a",
      theme: "dark",
      width: 1,
      height: 1,
      fps: 30,
      enter: "fade",
      exit: "fade",
      remotionVersion: "4.0.0-old",
    });
    await store.clean({
      stale: (entry) =>
        entry.type === "partial" &&
        (entry.key as { remotionVersion: string }).remotionVersion !== "4.99.0-fixed",
    });
    expect(await store.get("partial", "prm")).toBeNull();

    expect(() => parseOlderThanMs("not-a-duration")).toThrow();
  });

  it("stats aggregates bytes and counts", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-stats-", String(Date.now()));
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 20 });
    await store.ensureLayout();
    const src = path.join(root, "blob.wav");
    await fs.writeFile(src, Buffer.from("12345"));

    await store.put("audio", "k1", src, {
      ttsText: "t",
      voiceRefHash: "h",
      cfgValue: 1,
      inferenceTimesteps: 1,
      denoise: false,
      voxcpmModelVersion: "mv",
    });
    await store.get("audio", "k1");

    const s = await store.stats();
    expect(s.totalEntries).toBe(1);
    expect(s.totalBytesOnDisk).toBeGreaterThanOrEqual(5);
    expect(s.hitCountByType.audio.count).toBe(1);
    expect(s.hitCountByType.audio.hitsTotal).toBeGreaterThanOrEqual(1);
  });

  it("clean dryRun counts matches but keeps manifest and files", async () => {
    root = path.join(import.meta.dirname, "..", ".cache-test-clean-dry-", String(Date.now()));
    const store = new CacheStore({ cacheDir: root, maxSizeGB: 20 });
    await store.ensureLayout();
    const src = path.join(root, "blob.wav");
    await fs.writeFile(src, "z");

    await store.put("audio", "dryk", src, {
      ttsText: "t",
      voiceRefHash: "h",
      cfgValue: 1,
      inferenceTimesteps: 1,
      denoise: false,
      voxcpmModelVersion: "mv",
    });

    const n = await store.clean({ type: "audio", dryRun: true });
    expect(n).toBe(1);
    expect(await store.get("audio", "dryk")).not.toBeNull();
    await expect(fs.access(path.join(root, "audio", "dryk.wav"))).resolves.toBeUndefined();
  });
});

describe("runCacheCommand (CLI)", () => {
  let cacheDir: string;
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(import.meta.dirname, "..", `.cache-cli-test-${Date.now()}`);
    cacheDir = path.join(cwd, "cache-work");
    await fs.mkdir(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rimraf(cwd);
  });

  it("stats includes JSON payload with type breakdown", async () => {
    const cfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
      cache: { dir: cacheDir, maxSizeGB: 20 },
    });
    const cfgPath = path.join(cwd, "autovideo.config.json");
    await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCacheCommand({
      cwd,
      argv: [
        "node",
        "autovideo",
        `--config`,
        cfgPath,
        "cache",
        "stats",
        "--json",
      ],
    });

    expect(logSpy).toHaveBeenCalled();
    const first = String(logSpy.mock.calls[0]![0]);
    const payload = JSON.parse(first) as {
      totalEntries: number;
      byType: Record<string, { entries: number }>;
    };
    expect(payload.totalEntries).toBe(0);
    expect(payload.byType.audio.entries).toBe(0);
    expect(payload.byType.component.entries).toBe(0);
    expect(payload.byType.partial.entries).toBe(0);
  });

  it("clean dry-run reports count without deleting", async () => {
    const cfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
      cache: { dir: cacheDir, maxSizeGB: 20 },
    });
    const cfgPath = path.join(cwd, "autovideo.config.json");
    await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

    const store = new CacheStore({ cacheDir, maxSizeGB: 20 });
    await store.ensureLayout();
    const src = path.join(cwd, "blob.wav");
    await fs.writeFile(src, "wav");
    await store.put("audio", "kcli", src, {
      ttsText: "hi",
      voiceRefHash: "h",
      cfgValue: 1,
      inferenceTimesteps: 1,
      denoise: false,
      voxcpmModelVersion: "mv",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCacheCommand({
      cwd,
      argv: [
        "node",
        "autovideo",
        `--config`,
        cfgPath,
        "cache",
        "clean",
        "--type",
        "audio",
        "--dry-run",
      ],
    });

    const jsonLine = String(
      logSpy.mock.calls.find((c) => {
        const s = String(c[0]);
        return s.includes('"removed"') && s.includes('"dryRun"');
      })?.[0],
    );
    const out = JSON.parse(jsonLine) as { removed: number; dryRun: boolean };
    expect(out.dryRun).toBe(true);
    expect(out.removed).toBe(1);
    expect(await store.get("audio", "kcli")).not.toBeNull();
  });

  it("rejects invalid --type", async () => {
    const cfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
      cache: { dir: cacheDir, maxSizeGB: 20 },
    });
    const cfgPath = path.join(cwd, "autovideo.config.json");
    await fs.writeFile(cfgPath, JSON.stringify(cfg), "utf8");

    await expect(
      runCacheCommand({
        cwd,
        argv: [
          "node",
          "autovideo",
          `--config`,
          cfgPath,
          "cache",
          "clean",
          "--type",
          "nope",
        ],
      }),
    ).rejects.toThrow(/audio \| component \| partial/);
  });
});

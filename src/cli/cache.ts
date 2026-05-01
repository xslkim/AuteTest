import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Command } from "commander";

import { readComponentPromptMd5Prefix } from "../ai/prompt-version.js";
import {
  CacheStore,
  parseOlderThanMs,
  type CacheArtifactType,
  type CacheManifestEntry,
  type ComponentManifestKeyFields,
  type PartialManifestKeyFields,
} from "../cache/store.js";
import { loadResolvedCliConfig } from "../config/load.js";

const require = createRequire(import.meta.url);

export interface CacheCliOptions {
  argv: readonly string[];
  cwd: string;
}

function bytesHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[u]}`;
}

function currentRemotionVersion(): string | null {
  try {
    const pkgPath = join(dirname(require.resolve("@remotion/renderer/package.json")), "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const ver = (JSON.parse(raw) as { version?: string }).version;
    return typeof ver === "string" ? ver : null;
  } catch {
    return null;
  }
}

async function readPromptVersionPrefix(): Promise<string | null> {
  try {
    return await readComponentPromptMd5Prefix();
  } catch {
    return null;
  }
}

function makeStalePredicate(
  promptPrefix: string | null,
  remotionVer: string | null,
): (entry: CacheManifestEntry) => boolean {
  return (entry: CacheManifestEntry): boolean => {
    if (entry.type === "component") {
      const k = entry.key as ComponentManifestKeyFields;
      return promptPrefix != null && k.promptVersion !== promptPrefix;
    }
    if (entry.type === "partial") {
      const k = entry.key as PartialManifestKeyFields;
      return remotionVer != null && k.remotionVersion !== remotionVer;
    }
    return false;
  };
}

function statsJsonPayload(
  stats: Awaited<ReturnType<CacheStore["stats"]>>,
  promptPrefix: string | null,
  remotionVer: string | null,
): Record<string, unknown> {
  const byType: Record<string, unknown> = {};
  for (const t of ["audio", "component", "partial"] as const) {
    const row = stats.hitCountByType[t];
    const avgHits = row.count > 0 ? row.hitsTotal / row.count : 0;
    byType[t] = {
      entries: row.count,
      bytesOnDisk: row.bytesOnDisk,
      hitsTotal: row.hitsTotal,
      avgHitsPerEntry: Math.round(avgHits * 1000) / 1000,
    };
  }
  return {
    totalEntries: stats.totalEntries,
    totalBytesOnDisk: stats.totalBytesOnDisk,
    byType,
    promptVersionPrefix: promptPrefix,
    remotionVersion: remotionVer,
  };
}

function printStatsTable(stats: Awaited<ReturnType<CacheStore["stats"]>>): void {
  const rows: string[][] = [];
  rows.push(["type", "entries", "disk", "hitsΣ", "avg hits/entry"]);
  for (const t of ["audio", "component", "partial"] as const) {
    const r = stats.hitCountByType[t];
    const avg = r.count > 0 ? (r.hitsTotal / r.count).toFixed(2) : "—";
    rows.push([t, String(r.count), bytesHuman(r.bytesOnDisk), String(r.hitsTotal), avg]);
  }
  rows.push(["total", String(stats.totalEntries), bytesHuman(stats.totalBytesOnDisk), "", ""]);

  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  for (const row of rows) {
    const line = row.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");
    console.log(line);
  }
}

async function runStats(store: CacheStore, jsonOnly: boolean): Promise<void> {
  const stats = await store.stats();
  const promptPrefix = await readPromptVersionPrefix();
  const remotionVer = currentRemotionVersion();

  console.log(JSON.stringify(statsJsonPayload(stats, promptPrefix, remotionVer), null, 2));
  if (!jsonOnly) {
    console.log("");
    printStatsTable(stats);
  }
}

export async function runCacheCommand(opts: CacheCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  const { config } = loadResolvedCliConfig({ argv, cwd });
  const store = new CacheStore({
    cacheDir: config.resolvedCacheDir,
    maxSizeGB: config.cache.maxSizeGB,
  });

  const cacheCmd = new Command("cache")
    .description("Inspect and clean global artifact cache")
    .allowUnknownOption(true);

  cacheCmd
    .command("stats")
    .description("Print cache statistics (JSON plus human-readable table unless --json)")
    .allowUnknownOption(true)
    .option("--json", "emit JSON only", false)
    .action(async (o: { json?: boolean }) => {
      await runStats(store, Boolean(o.json));
    });

  const cleanCmd = cacheCmd
    .command("clean")
    .description("Remove cache entries (files + manifest)")
    .allowUnknownOption(true)
    .option("--type <t>", "audio | component | partial")
    .option("--older-than <duration>", "ms format e.g. 30d, 12h (filters by lastHitAt)")
    .option("--stale", "remove entries whose promptVersion/remotionVersion mismatches current toolchain", false)
    .option("--dry-run", "show how many entries would be removed", false);

  cleanCmd.action(async (o: { type?: string; olderThan?: string; stale?: boolean; dryRun?: boolean }) => {
    let typeFilter: CacheArtifactType | undefined;
    if (o.type !== undefined) {
      if (o.type !== "audio" && o.type !== "component" && o.type !== "partial") {
        throw new Error(`--type must be audio | component | partial; got ${JSON.stringify(o.type)}`);
      }
      typeFilter = o.type;
    }

    let olderThanMs: number | undefined;
    if (o.olderThan !== undefined) {
      olderThanMs = parseOlderThanMs(o.olderThan);
    }

    let stalePred: ((entry: CacheManifestEntry) => boolean) | undefined;
    if (o.stale) {
      const promptPrefix = await readPromptVersionPrefix();
      stalePred = makeStalePredicate(promptPrefix, currentRemotionVersion());
    }

    const removed = await store.clean({
      type: typeFilter,
      olderThanMs,
      stale: stalePred,
      dryRun: Boolean(o.dryRun),
    });

    const verb = o.dryRun ? "would remove" : "removed";
    console.log(JSON.stringify({ removed, dryRun: Boolean(o.dryRun), cacheDir: store.cacheDir }, null, 2));
    if (!o.dryRun) {
      console.log(`${verb} ${removed} cache entr${removed === 1 ? "y" : "ies"}`);
    } else {
      console.log(`dry-run: ${verb} ${removed} cache entr${removed === 1 ? "y" : "ies"}`);
    }
  });

  const rest = argv.slice(2);
  const idx = rest.indexOf("cache");
  const forward = idx >= 0 ? rest.slice(idx + 1) : [];

  await cacheCmd.parseAsync(forward, { from: "user" });
}

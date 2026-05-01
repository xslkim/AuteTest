/**
 * Invoked via `tsx tests/cache-worker-put.ts <cacheDir> <uniqueKeySuffix>`
 * Writes a temp file then CacheStore.put; exits 0 on success.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CacheArtifactType } from "../src/cache/store.js";
import { CacheStore } from "../src/cache/store.js";

async function main(): Promise<void> {
  const cacheDir = process.argv[2];
  const suffix = process.argv[3];
  if (!cacheDir || !suffix) {
    process.exit(2);
  }
  const type: CacheArtifactType = "audio";
  const key = `concurrent_${suffix}`;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-cache-wav-"));
  const src = path.join(tmpDir, "x.wav");
  await fs.writeFile(src, Buffer.from(`wav-${suffix}-${Date.now()}`));

  const store = new CacheStore({ cacheDir, maxSizeGB: 999 });
  await store.ensureLayout();
  await store.put(type, key, src, {
    ttsText: `t${suffix}`,
    voiceRefHash: "vh",
    cfgValue: 1,
    inferenceTimesteps: 1,
    denoise: false,
    voxcpmModelVersion: "m1",
  });
}

await main();

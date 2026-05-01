import { describe, expect, it } from "vitest";

import { DEFAULT_VOXCPM } from "../src/config/defaults.js";
import { VoxcpmClient } from "../src/tts/voxcpm-client.js";
import { allocateLocalPort, ensureVoxcpmServer } from "../src/tts/voxcpm-server.js";

const runIntegration = process.env.RUN_VOXCPM_INTEGRATION === "1";

describe.skipIf(!runIntegration)("ensureVoxcpmServer (integration)", () => {
  it("autoStart 拉起 uvicorn 后 /health 可达", async () => {
    const port = await allocateLocalPort("127.0.0.1");
    const endpoint = `http://127.0.0.1:${port}`;
    const handle = await ensureVoxcpmServer({
      voxcpm: {
        ...DEFAULT_VOXCPM,
        endpoint,
        modelDir: "/tmp",
        autoStart: true,
      },
      startupTimeoutMs: 120_000,
      pollIntervalMs: 250,
    });
    try {
      const client = new VoxcpmClient({ baseUrl: handle.baseUrl });
      await expect(client.health()).resolves.toBe(true);
    } finally {
      await handle.dispose();
    }
  });
});

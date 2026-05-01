import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoxcpmClient } from "../src/tts/voxcpm-client.js";

describe("VoxcpmClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("health() 在 200 + status ok 时为 true", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok", model_version: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const c = new VoxcpmClient({ baseUrl: "http://127.0.0.1:9999/", fetchImpl });
    await expect(c.health()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("registerVoice → speak 串联请求体与返回 Buffer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "av-vox-"));
    const wavPath = join(dir, "ref.wav");
    writeFileSync(wavPath, Buffer.from([1, 2, 3, 4]));

    const wavPayload = Buffer.from([9, 9, 9]);

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/voices")) {
        const body = JSON.parse(String(init?.body)) as { wav_base64?: string };
        expect(body.wav_base64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
        return new Response(JSON.stringify({ voice_id: "v_test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/v1/speech")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          text: "你好",
          voice_id: "v_test",
          cfg_value: 2,
          inference_timesteps: 10,
          denoise: false,
          retry_badcase: true,
        });
        return new Response(wavPayload, {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const c = new VoxcpmClient({ baseUrl: "http://localhost:8000", fetchImpl });
    const voiceId = await c.registerVoice(wavPath);
    expect(voiceId).toBe("v_test");
    const out = await c.speak("你好", voiceId, {
      cfgValue: 2,
      inferenceTimesteps: 10,
      denoise: false,
      retryBadcase: true,
    });
    expect(out.equals(wavPayload)).toBe(true);
  });
});

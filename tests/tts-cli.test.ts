import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { AutovideoRawConfig } from "../src/config/types.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import { mergeAutovideoConfig } from "../src/config/load.js";
import { runTtsCommand } from "../src/cli/tts.js";

function assertFfmpegOk(result: ReturnType<typeof spawnSync>): void {
  expect(result.status, result.stderr?.toString()).toBe(0);
}

function wavFromLavfi(durationSec: number): Buffer {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono",
      "-t",
      String(durationSec),
      "-acodec",
      "pcm_s16le",
      "-f",
      "wav",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  assertFfmpegOk(r);
  return r.stdout as Buffer;
}

describe("tts CLI（mock VoxCPM）", () => {
  const root = mkdtempSync(join(tmpdir(), "av-tts-cli-"));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("2 块 5 行：写出 audio + script.json；第二次 0 次 /v1/speech", async () => {
    const buildDir = join(root, "build");
    const cacheDir = join(buildDir, ".tts-cache");
    const modelDir = join(buildDir, "model-empty");
    mkdirSync(modelDir, { recursive: true });

    const voicePath = join(buildDir, "B00.wav");
    writeFileSync(voicePath, wavFromLavfi(0.2));

    const scriptPath = join(buildDir, "script.json");
    const script = {
      meta: {
        schemaVersion: "1.0",
        title: "tts-cli-test",
        voiceRef: voicePath,
        aspect: "16:9",
        width: 1920,
        height: 1080,
        fps: 30,
        theme: "dark-code",
        subtitleSafeBottom: 162,
      },
      blocks: [
        {
          id: "B01",
          title: "A",
          enter: "fade",
          exit: "fade",
          visual: { description: "x" },
          narration: {
            lines: [
              { text: "L1", ttsText: "第一行", highlights: [] },
              { text: "L2", ttsText: "第二行", highlights: [] },
            ],
          },
        },
        {
          id: "B02",
          title: "B",
          enter: "fade",
          exit: "fade",
          visual: { description: "y" },
          narration: {
            lines: [
              { text: "L3", ttsText: "第三行", highlights: [] },
              { text: "L4", ttsText: "第四行", highlights: [] },
              { text: "L5", ttsText: "第五行", highlights: [] },
            ],
          },
        },
      ],
      artifacts: { compiledAt: "2026-05-01T00:00:00.000Z" },
      assets: {},
    };
    writeFileSync(scriptPath, `${JSON.stringify(script, null, 2)}\n`, "utf8");

    const cfgPath = join(buildDir, "autovideo.config.json");

    await new Promise<void>((resolve, reject) => {
      let speechHits = 0;
      const srv = createServer((req, res) => {
        const url = req.url ?? "";
        if (req.method === "GET" && url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (req.method === "POST" && url === "/v1/voices") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ voice_id: "v_mock" }));
          return;
        }
        if (req.method === "POST" && url === "/v1/speech") {
          speechHits += 1;
          const body = wavFromLavfi(0.05);
          res.writeHead(200, { "Content-Type": "audio/wav" });
          res.end(body);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address() as AddressInfo;
        const port = addr.port;
        const rawCfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
          voxcpm: {
            endpoint: `http://127.0.0.1:${String(port)}`,
            modelDir,
            autoStart: false,
            concurrency: 4,
          },
          cache: { dir: cacheDir, evictTrigger: "manual" },
        } as Partial<AutovideoRawConfig>);
        writeFileSync(cfgPath, `${JSON.stringify(rawCfg, null, 2)}\n`, "utf8");

        const argvBase = [
          "node",
          "autovideo",
          "tts",
          "script.json",
          "--config",
          cfgPath,
          "--cache-dir",
          cacheDir,
        ] as const;

        runTtsCommand({ argv: [...argvBase], cwd: buildDir })
          .then(() => {
            expect(speechHits).toBe(5);
            return runTtsCommand({ argv: [...argvBase], cwd: buildDir });
          })
          .then(() => {
            expect(speechHits).toBe(5);
            srv.close((err) => (err ? reject(err) : resolve()));
          })
          .catch((e) => {
            srv.close(() => reject(e));
          });
      });

      srv.on("error", reject);
    });

    const out = JSON.parse(readFileSync(scriptPath, "utf8")) as {
      blocks: Array<{
        id: string;
        audio?: { wavPath: string; lineTimings: unknown[]; durationSec: number };
        narration: { lines: unknown[] };
      }>;
      artifacts: { audioGeneratedAt?: string };
    };

    expect(out.artifacts.audioGeneratedAt).toBeDefined();
    for (const b of out.blocks) {
      expect(b.audio).toBeDefined();
      expect(b.audio!.wavPath).toBe(`public/audio/${b.id}.wav`);
      expect(b.audio!.lineTimings.length).toBe(b.narration.lines.length);
    }
    expect(
      readFileSync(join(buildDir, "public", "audio", "B01.wav")).length,
    ).toBeGreaterThan(100);
    expect(
      readFileSync(join(buildDir, "public", "audio", "B02.wav")).length,
    ).toBeGreaterThan(100);
  });
});

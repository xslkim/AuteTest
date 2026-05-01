/**
 * T9.2：端到端 build（真 Remotion + ffmpeg），VoxCPM HTTP mock；Claude 由 `generateComponentTsx` mock。
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai/component-gen.js", () => ({
  generateComponentTsx: vi.fn(),
}));

import type { AutovideoRawConfig } from "../src/config/types.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import { mergeAutovideoConfig } from "../src/config/load.js";
import { runBuildCommand } from "../src/cli/build.js";
import { generateComponentTsx } from "../src/ai/component-gen.js";
import {
  expectedFinalDurationSecFromBlocks,
  ffprobeVideoStreamDurationSec,
} from "../src/render/qa.js";
import type { Script } from "../src/types/script.js";

const FIXTURE_ROOT = path.resolve(import.meta.dirname, "fixtures", "t15-project");

const deterministicComponentTsx = `import React from "react";

export default function E2EBlock(props: AnimationProps) {
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        backgroundColor: "rgb(90, 110, 140)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#e8e8e8",
        fontSize: Math.floor(props.height * 0.06),
        fontFamily: props.theme.fonts.sans,
      }}
    >
      E2E
    </div>
  );
}
`;

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

function ffprobeVideoSize(videoPath: string): { width: number; height: number } {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  const j = JSON.parse(r.stdout) as { streams?: Array<{ width?: number; height?: number }> };
  const s = j.streams?.[0];
  expect(s?.width).toBeDefined();
  expect(s?.height).toBeDefined();
  return { width: s!.width!, height: s!.height! };
}

/** 35 行 Python，块 2 用「第 30-32 行」触发内联 fenced */
function samplePyLines(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 28; i += 1) {
    lines.push(`# filler line ${i}`);
  }
  lines.push("def add(a, b):");
  lines.push("    return a + b");
  lines.push("");
  lines.push("def mul(a, b):");
  lines.push("    return a * b");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function withMockVoxcpm(portCallback: (port: number) => Promise<void>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const srv = createServer((req, res) => {
      const url = req.url ?? "";
      if (req.method === "GET" && url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.method === "POST" && url === "/v1/voices") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ voice_id: "v_e2e_mock" }));
        return;
      }
      if (req.method === "POST" && url === "/v1/speech") {
        const body = wavFromLavfi(0.08);
        res.writeHead(200, { "Content-Type": "audio/wav" });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    srv.listen(0, "127.0.0.1", () => {
      void (async () => {
        try {
          const addr = srv.address() as AddressInfo;
          await portCallback(addr.port);
          srv.close((err) => (err ? reject(err) : resolve()));
        } catch (e) {
          srv.close(() => reject(e));
        }
      })();
    });

    srv.on("error", reject);
  });
}

describe("E2E build (real Remotion)", () => {
  let projectRoot: string;
  let cacheDir: string;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-e2e-mock";
    vi.mocked(generateComponentTsx).mockReset();
    vi.mocked(generateComponentTsx).mockResolvedValue({
      tsx: deterministicComponentTsx,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
      cacheHit: false,
    });

    projectRoot = mkdtempSync(path.join(tmpdir(), "av-e2e-"));
    cacheDir = path.join(projectRoot, ".cache");
    mkdirSync(cacheDir, { recursive: true });

    mkdirSync(path.join(projectRoot, "assets"), { recursive: true });
    mkdirSync(path.join(projectRoot, "src"), { recursive: true });

    writeFileSync(
      path.join(projectRoot, "meta.md"),
      readFileSync(path.join(FIXTURE_ROOT, "meta.md"), "utf8"),
    );
    writeFileSync(
      path.join(projectRoot, "B00.wav"),
      readFileSync(path.join(FIXTURE_ROOT, "B00.wav")),
    );
    writeFileSync(
      path.join(projectRoot, "assets", "e2e.png"),
      readFileSync(path.join(FIXTURE_ROOT, "assets", "diagram.png")),
    );
    writeFileSync(path.join(projectRoot, "src", "sample.py"), samplePyLines());

    writeFileSync(
      path.join(projectRoot, "blocks.md"),
      `>>> 图示块 #B01
@enter: none
@exit: none

--- visual ---
居中显示本地图片 ./assets/e2e.png

--- narration ---
第一行旁白
第二行收束

>>> 代码块 #B02
@enter: none
@exit: none

--- visual ---
深色面板展示 ./src/sample.py 第 30-32 行要点

--- narration ---
代码与资产引用已进 IR
`,
    );

    writeFileSync(
      path.join(projectRoot, "project.json"),
      JSON.stringify({ meta: "./meta.md", blocks: ["./blocks.md"] }, null, 2),
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    if (prevAnthropic === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevAnthropic;
    }
  });

  it(
    "compile → tts → visuals → render 产出 final_normalized.mp4，时长与分辨率符合 script.json",
    async () => {
      const buildOut = path.join(projectRoot, "build-e2e");
      const modelDir = path.join(projectRoot, "model-dir-stub");
      mkdirSync(modelDir, { recursive: true });

      const cfgPath = path.join(projectRoot, "autovideo.config.json");

      await withMockVoxcpm(async (port) => {
        const rawCfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
          voxcpm: {
            endpoint: `http://127.0.0.1:${String(port)}`,
            modelDir,
            autoStart: false,
            concurrency: 2,
          },
          render: {
            loudnorm: { twoPass: false },
            blockConcurrency: 1,
            framesConcurrencyPerBlock: 1,
          },
          cache: { dir: cacheDir, evictTrigger: "manual" },
        } as Partial<AutovideoRawConfig>);
        writeFileSync(cfgPath, `${JSON.stringify(rawCfg, null, 2)}\n`, "utf8");

        await runBuildCommand({
          cwd: projectRoot,
          argv: [
            "node",
            "autovideo",
            "build",
            "project.json",
            "--out",
            "build-e2e",
            "--config",
            cfgPath,
            "--cache-dir",
            cacheDir,
          ],
        });
      });

      const finalPath = path.join(buildOut, "output", "final_normalized.mp4");
      expect(existsSync(finalPath)).toBe(true);

      const script = JSON.parse(
        readFileSync(path.join(buildOut, "script.json"), "utf8"),
      ) as Script;

      expect(script.blocks).toHaveLength(2);
      const b01 = script.blocks.find((b) => b.id === "B01");
      const b02 = script.blocks.find((b) => b.id === "B02");
      expect(b01).toBeDefined();
      expect(b02).toBeDefined();

      expect(b01!.visual.description).toMatch(/assets\/[a-f0-9]{8}\.png/);
      expect(b02!.visual.description).toMatch(/assets\/[a-f0-9]{8}\.py/);
      expect(b02!.visual.description).toContain("def add");

      for (const b of script.blocks) {
        expect(b.audio).toBeDefined();
        expect(b.visual.componentPath).toBe(`src/blocks/${b.id}/Component.tsx`);
        expect(b.timing?.frames).toBeDefined();
      }

      const expectedSec = expectedFinalDurationSecFromBlocks(script.blocks, script.meta.fps);
      const actualSec = ffprobeVideoStreamDurationSec(finalPath);
      expect(Math.abs(actualSec - expectedSec) * script.meta.fps).toBeLessThanOrEqual(2.05);

      const { width, height } = ffprobeVideoSize(finalPath);
      expect(width).toBe(script.meta.width);
      expect(height).toBe(script.meta.height);

      expect(vi.mocked(generateComponentTsx).mock.calls.length).toBe(2);
    },
    420_000,
  );
});

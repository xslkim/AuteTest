import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@remotion/bundler", () => ({
  bundle: (...args: unknown[]) => bundleMock(...args),
}));

vi.mock("@remotion/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@remotion/renderer")>();
  return {
    ...mod,
    renderMedia: (...args: unknown[]) => renderMediaMock(...args),
    selectComposition: (...args: unknown[]) => selectCompositionMock(...args),
  };
});

vi.mock("../src/ai/component-gen.js", () => ({
  generateComponentTsx: vi.fn(),
}));

vi.mock("../src/ai/validate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ai/validate.js")>();
  return {
    ...actual,
    validateRenderSmoke: vi.fn().mockResolvedValue({ ok: true }),
  };
});

const renderMediaMock = vi.fn();
const selectCompositionMock = vi.fn();
const bundleMock = vi.fn();

import type { AutovideoRawConfig } from "../src/config/types.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import { mergeAutovideoConfig } from "../src/config/load.js";
import { runBuildCommand } from "../src/cli/build.js";
import { generateComponentTsx } from "../src/ai/component-gen.js";
import type { Script } from "../src/types/script.js";

const FIXTURE_ROOT = path.resolve(import.meta.dirname, "fixtures", "t15-project");

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

const goodTsx = `import React from "react";

export default function Good(props: AnimationProps) {
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        backgroundColor: "rgb(120, 40, 200)",
      }}
    />
  );
}
`;

async function writePartialMp4(outPath: string, durationSec: number): Promise<void> {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const enc = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=1920x1080:r=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:sample_rate=48000",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-c:a",
      "aac",
      "-t",
      String(durationSec),
      outPath,
    ],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  expect(enc.status).toBe(0);
}

describe("runBuildCommand", () => {
  let root: string;
  let cacheDir: string;
  const prevKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-build-test";
    renderMediaMock.mockReset();
    selectCompositionMock.mockReset();
    bundleMock.mockReset();

    bundleMock.mockResolvedValue("http://mock-remotion-bundle/");
    selectCompositionMock.mockResolvedValue({
      id: "Block",
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: 120,
    });

    vi.mocked(generateComponentTsx).mockReset();

    root = mkdtempSync(path.join(tmpdir(), "av-build-cli-"));
    cacheDir = path.join(root, "cache");
    mkdirSync(cacheDir, { recursive: true });

    mkdirSync(path.join(root, "pix"), { recursive: true });
    writeFileSync(path.join(root, "meta.md"), readFileSync(path.join(FIXTURE_ROOT, "meta.md"), "utf8"));
    writeFileSync(path.join(root, "B00.wav"), readFileSync(path.join(FIXTURE_ROOT, "B00.wav")));
    writeFileSync(
      path.join(root, "pix", "diagram.png"),
      readFileSync(path.join(FIXTURE_ROOT, "assets", "diagram.png")),
    );
    writeFileSync(
      path.join(root, "content.md"),
      `>>> Tiny #B01
@enter: fade
--- visual ---
显示图片 ./pix/diagram.png
--- narration ---
第一行

>>> Tiny2 #B02
--- visual ---
纯色
--- narration ---
第二行

`,
    );
    writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({ meta: "./meta.md", blocks: ["./content.md"] }, null, 2),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  async function mockVoxcpmAndRun(cb: () => Promise<void>): Promise<void> {
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
          res.end(JSON.stringify({ voice_id: "v_mock_build" }));
          return;
        }
        if (req.method === "POST" && url === "/v1/speech") {
          const body = wavFromLavfi(0.05);
          res.writeHead(200, { "Content-Type": "audio/wav" });
          res.end(body);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      srv.listen(0, "127.0.0.1", async () => {
        try {
          const addr = srv.address() as AddressInfo;
          const port = addr.port;
          const modelDir = path.join(root, "model-empty");
          mkdirSync(modelDir, { recursive: true });

          const rawCfg = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
            voxcpm: {
              endpoint: `http://127.0.0.1:${String(port)}`,
              modelDir,
              autoStart: false,
              concurrency: 4,
            },
            render: {
              loudnorm: { twoPass: false },
            },
            cache: { dir: cacheDir, evictTrigger: "manual" },
          } as Partial<AutovideoRawConfig>);

          const cfgPath = path.join(root, "autovideo.config.json");
          writeFileSync(cfgPath, `${JSON.stringify(rawCfg, null, 2)}\n`, "utf8");

          await cb();
          srv.close((err) => (err ? reject(err) : resolve()));
        } catch (e) {
          srv.close(() => reject(e));
        }
      });

      srv.on("error", reject);
    });
  }

  it(
    "E2E: build runs compile → tts → visuals → render; produces final_normalized.mp4",
    async () => {
      const buildDir = path.join(root, "build-out");

      renderMediaMock.mockImplementation(
        async (opts: { outputLocation: string; inputProps?: { blockId?: string } }) => {
          const scriptOnDisk = JSON.parse(
            readFileSync(path.join(buildDir, "script.json"), "utf8"),
          ) as Script;
          const bid = opts.inputProps?.blockId;
          const block = scriptOnDisk.blocks.find((b) => b.id === bid);
          const frames = block?.timing?.frames;
          if (frames == null) throw new Error(`mock: no timing for ${bid}`);
          const dur = frames / scriptOnDisk.meta.fps;
          await writePartialMp4(opts.outputLocation, dur);
        },
      );

      vi.mocked(generateComponentTsx).mockResolvedValue({
        tsx: goodTsx,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
        cacheHit: false,
      });

      await mockVoxcpmAndRun(async () => {
        await runBuildCommand({
          cwd: root,
          argv: [
            "node",
            "autovideo",
            "build",
            "project.json",
            "--out",
            "build-out",
            "--config",
            path.join(root, "autovideo.config.json"),
            "--cache-dir",
            cacheDir,
          ],
        });
      });

      expect(existsSync(path.join(buildDir, "script.json"))).toBe(true);
      const script = JSON.parse(readFileSync(path.join(buildDir, "script.json"), "utf8")) as Script;

      expect(script.blocks).toHaveLength(2);
      for (const b of script.blocks) {
        expect(b.audio).toBeDefined();
        expect(b.visual.componentPath).toBe(`src/blocks/${b.id}/Component.tsx`);
      }

      expect(existsSync(path.join(buildDir, "output", "final_normalized.mp4"))).toBe(true);
      expect(renderMediaMock).toHaveBeenCalledTimes(2);
    },
    120_000,
  );

  it("rejects --block with actionable hint", async () => {
    await expect(
      runBuildCommand({
        cwd: root,
        argv: ["node", "autovideo", "build", "project.json", "--block", "B01"],
      }),
    ).rejects.toThrow(/不支持 --block/);
  });

  it("--dry-run: only compile dry path; no build out dir written", async () => {
    await runBuildCommand({
      cwd: root,
      argv: [
        "node",
        "autovideo",
        "build",
        "project.json",
        "--out",
        "build-out",
        "--dry-run",
      ],
    });

    expect(existsSync(path.join(root, "build-out"))).toBe(false);
  });
});

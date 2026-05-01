import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderMediaMock = vi.fn();
const selectCompositionMock = vi.fn();
const bundleMock = vi.fn();

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

import { runRenderCommand } from "../src/cli/render.js";
import { DEFAULT_CACHE, DEFAULT_RENDER, DEFAULT_VOXCPM } from "../src/config/defaults.js";
import type { Script } from "../src/types/script.js";
import { wavDurationSec } from "../src/tts/audio.js";

describe("runRenderCommand", () => {
  const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");

  let root: string;
  let cacheDir: string;

  beforeEach(() => {
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
    renderMediaMock.mockResolvedValue(undefined);

    root = mkdtempSync(path.join(tmpdir(), "av-render-cli-"));
    cacheDir = path.join(root, "cache");
    mkdirSync(cacheDir, { recursive: true });

    const cfg = {
      voxcpm: DEFAULT_VOXCPM,
      anthropic: {
        apiKeyEnv: "ANTHROPIC_API_KEY",
        model: "claude-sonnet-4-6",
        promptCaching: true,
        maxRetries: 3,
        concurrency: 4,
      },
      render: {
        ...DEFAULT_RENDER,
        loudnorm: { ...DEFAULT_RENDER.loudnorm, twoPass: false },
      },
      cache: { ...DEFAULT_CACHE, dir: cacheDir, evictTrigger: "manual" as const },
    };
    writeFileSync(path.join(root, "autovideo.config.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function writeSineStereoWav(outPath: string, durationSec: number): Promise<void> {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        String(durationSec),
        "-ac",
        "2",
        outPath,
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    expect(r.status).toBe(0);
  }

  async function writePartialMp4(outPath: string, durationSec: number): Promise<void> {
    mkdirSync(path.dirname(outPath), { recursive: true });
    const { spawnSync } = await import("node:child_process");
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

  async function buildTwoBlockFixture(): Promise<string> {
    const fixtureScriptPath = path.join(repoRoot, "public", "script.json");
    const script = JSON.parse(readFileSync(fixtureScriptPath, "utf8")) as Script;
    const b01 = script.blocks[0];
    if (b01?.id !== "B01") throw new Error("fixture expects B01");
    const b02 = {
      ...JSON.parse(JSON.stringify(b01)),
      id: "B02",
      title: "Second",
      visual: { ...b01.visual, componentPath: "src/blocks/B02/Component.tsx" },
      audio: {
        ...b01.audio!,
        wavPath: "public/audio/B02.wav",
      },
    };
    script.blocks = [b01, b02];

    cpSync(path.join(repoRoot, "src", "blocks", "B01"), path.join(root, "src", "blocks", "B01"), {
      recursive: true,
    });
    cpSync(path.join(repoRoot, "src", "blocks", "B01"), path.join(root, "src", "blocks", "B02"), {
      recursive: true,
    });

    mkdirSync(path.join(root, "public", "audio"), { recursive: true });
    await writeSineStereoWav(path.join(root, "public", "audio", "B01.wav"), 4);
    await writeSineStereoWav(path.join(root, "public", "audio", "B02.wav"), 4);

    const durationSec = wavDurationSec(path.join(root, "public", "audio", "B01.wav"));
    const lineTimings = [
      { lineIndex: 0, startMs: 0, endMs: 1000 },
      { lineIndex: 1, startMs: 1200, endMs: 3800 },
    ];
    for (const b of script.blocks) {
      if (b.audio != null) {
        b.audio.durationSec = durationSec;
        b.audio.lineTimings = lineTimings;
      }
    }

    const scriptPath = path.join(root, "script.json");
    writeFileSync(scriptPath, `${JSON.stringify(script, null, 2)}\n`);
    return scriptPath;
  }

  it(
    "E2E mock: full pipeline writes final_normalized.mp4 + renderedAt",
    async () => {
      await buildTwoBlockFixture();

      renderMediaMock.mockImplementation(
        async (opts: { outputLocation: string; inputProps?: { blockId?: string } }) => {
          const scriptOnDisk = JSON.parse(
            readFileSync(path.join(root, "script.json"), "utf8"),
          ) as Script;
          const bid = opts.inputProps?.blockId;
          const block = scriptOnDisk.blocks.find((b) => b.id === bid);
          const frames = block?.timing?.frames;
          if (frames == null) throw new Error(`mock: no timing for ${bid}`);
          const dur = frames / scriptOnDisk.meta.fps;
          await writePartialMp4(opts.outputLocation, dur);
        },
      );

      await runRenderCommand({
        cwd: root,
        argv: ["node", "autovideo", "render", "script.json", "--cache-dir", cacheDir],
      });

      const norm = path.join(root, "output", "final_normalized.mp4");
      expect(existsSync(norm)).toBe(true);

      const saved = JSON.parse(readFileSync(path.join(root, "script.json"), "utf8")) as Script;
      expect(saved.artifacts.renderedAt).toMatch(/^\d{4}-/);
      expect(saved.blocks.every((b) => b.timing != null)).toBe(true);
      expect(saved.blocks.every((b) => b.render != null)).toBe(true);

      expect(renderMediaMock).toHaveBeenCalledTimes(2);
    },
    120_000,
  );

  it(
    "E2E mock: --block B01 --force only re-renders B01; B02 partial mtime stable",
    async () => {
      await buildTwoBlockFixture();

      renderMediaMock.mockImplementation(
        async (opts: { outputLocation: string; inputProps?: { blockId?: string } }) => {
          const scriptOnDisk = JSON.parse(
            readFileSync(path.join(root, "script.json"), "utf8"),
          ) as Script;
          const bid = opts.inputProps?.blockId;
          const block = scriptOnDisk.blocks.find((b) => b.id === bid);
          const frames = block?.timing?.frames;
          if (frames == null) throw new Error(`mock: no timing for ${bid}`);
          const dur = frames / scriptOnDisk.meta.fps;
          await writePartialMp4(opts.outputLocation, dur);
        },
      );

      await runRenderCommand({
        cwd: root,
        argv: ["node", "autovideo", "render", "script.json", "--cache-dir", cacheDir],
      });

      const b02partial = path.join(root, "output", "partials", "B02.mp4");
      const mtimeAfterFull = statSync(b02partial).mtimeMs;

      renderMediaMock.mockClear();

      await runRenderCommand({
        cwd: root,
        argv: [
          "node",
          "autovideo",
          "render",
          "script.json",
          "--block",
          "B01",
          "--force",
          "--cache-dir",
          cacheDir,
        ],
      });

      expect(statSync(b02partial).mtimeMs).toBe(mtimeAfterFull);
      expect(renderMediaMock).toHaveBeenCalledTimes(1);
      const onlyArg = renderMediaMock.mock.calls[0]![0] as { inputProps?: { blockId?: string } };
      expect(onlyArg.inputProps?.blockId).toBe("B01");
    },
    180_000,
  );
});

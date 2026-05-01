import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Count `renderMedia` invocations (wrap before `render-blocks` loads). */
const renderMediaCalls = vi.fn();

vi.mock("@remotion/renderer", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@remotion/renderer")>();
  const origRenderMedia = mod.renderMedia;
  return {
    ...mod,
    renderMedia: (async (...args: Parameters<typeof origRenderMedia>) => {
      renderMediaCalls();
      return origRenderMedia(...args);
    }) as typeof origRenderMedia,
  };
});

import { CacheStore } from "../src/cache/store.js";
import { DEFAULT_RENDER } from "../src/config/defaults.js";
import { concatPartials } from "../src/render/concat.js";
import { normalizeFinalWithLoudnorm, probeIntegratedLoudnessLufs } from "../src/render/loudnorm.js";
import { computePartialCacheBundle } from "../src/render/partial-cache-key.js";
import { renderBlockPartials, readRemotionRendererVersion } from "../src/render/render-blocks.js";
import type { Script } from "../src/types/script.js";
import { wavDurationSec } from "../src/tts/audio.js";

const runIntegration = process.env.RUN_RENDER_PARTIAL_INTEGRATION === "1";

describe.skipIf(!runIntegration)("renderBlockPartials integration", () => {
  const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const fixtureScriptPath = join(repoRoot, "public", "script.json");
  const cacheRoot = mkdtempSync(join(tmpdir(), "av-partial-int-"));
  const buildDir = mkdtempSync(join(tmpdir(), "av-build-out-"));

  beforeAll(() => {
    if (!existsSync(fixtureScriptPath)) {
      throw new Error("fixture public/script.json missing");
    }
  });

  afterAll(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(buildDir, { recursive: true, force: true });
  });

  /** 首帧视频包是否含 `K`（keyframe）标志 */
  function ffprobeFirstPacketIsKeyframe(videoPath: string): boolean {
    const r = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=flags",
        "-of",
        "csv=p=0",
        videoPath,
      ],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    const first = r.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
    return first != null && first.includes("K");
  }

  /** Non-silent stereo WAV so ffmpeg loudnorm first pass returns finite `input_i` (fixture `B01.wav` is ~silent). */
  function writeIntegrationTestWav(outPath: string, durationSec: number): void {
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

  function prepareBuildLayout(): Script {
    const script = JSON.parse(readFileSync(fixtureScriptPath, "utf8")) as Script;
    const b01 = script.blocks[0];
    if (b01?.id !== "B01") {
      throw new Error("expected first block B01 in fixture");
    }

    const b02 = {
      ...JSON.parse(JSON.stringify(b01)),
      id: "B02",
      title: "Second block",
      visual: { ...b01.visual, componentPath: "src/blocks/B02/Component.tsx" },
      audio: {
        ...b01.audio!,
        wavPath: "public/audio/B02.wav",
      },
    } as typeof b01;
    script.blocks = [b01, b02];

    cpSync(join(repoRoot, "src", "blocks", "B01"), join(buildDir, "src", "blocks", "B01"), {
      recursive: true,
    });
    cpSync(join(repoRoot, "src", "blocks", "B01"), join(buildDir, "src", "blocks", "B02"), {
      recursive: true,
    });
    mkdirSync(join(buildDir, "public", "audio"), { recursive: true });
    const wavB01 = join(buildDir, "public", "audio", "B01.wav");
    const wavB02 = join(buildDir, "public", "audio", "B02.wav");
    writeIntegrationTestWav(wavB01, 4);
    writeIntegrationTestWav(wavB02, 4);
    const durationSec = wavDurationSec(wavB01);
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

    writeFileSync(join(buildDir, "script.json"), `${JSON.stringify(script, null, 2)}\n`, "utf8");
    return script;
  }

  it(
    "two blocks render once; second run cache hit; first frame IDR",
    async () => {
    const script = prepareBuildLayout();
    const remotionVersion = readRemotionRendererVersion();
    const store = new CacheStore({ cacheDir: cacheRoot, maxSizeGB: 50 });

    renderMediaCalls.mockClear();

    await renderBlockPartials({
      script: JSON.parse(JSON.stringify(script)) as Script,
      buildOutDirAbs: buildDir,
      cacheStore: store,
      remotionVersion,
      render: { ...DEFAULT_RENDER, blockConcurrency: 2, framesConcurrencyPerBlock: 1 },
      cacheEvictOnStageStart: false,
      verbose: false,
    });

    expect(renderMediaCalls).toHaveBeenCalledTimes(2);

    const p1 = join(buildDir, "output", "partials", "B01.mp4");
    const p2 = join(buildDir, "output", "partials", "B02.mp4");
    expect(existsSync(p1)).toBe(true);
    expect(existsSync(p2)).toBe(true);
    expect(ffprobeFirstPacketIsKeyframe(p1)).toBe(true);
    expect(ffprobeFirstPacketIsKeyframe(p2)).toBe(true);

    await concatPartials({
      partialPathsAbs: [p1, p2],
      buildOutDirAbs: buildDir,
    });
    expect(existsSync(join(buildDir, "output", "concat.txt"))).toBe(true);
    const finalPath = join(buildDir, "output", "final.mp4");
    expect(existsSync(finalPath)).toBe(true);

    const replay = spawnSync(
      "ffmpeg",
      ["-nostats", "-v", "warning", "-i", finalPath, "-f", "null", "-"],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
    expect(replay.status).toBe(0);
    const log = replay.stderr.toLowerCase();
    expect(log).not.toMatch(/non-monotonic dts|invalid timestamps|dts < 0/);

    const normPath = join(buildDir, "output", "final_normalized.mp4");
    await normalizeFinalWithLoudnorm({
      finalPathAbs: finalPath,
      outputPathAbs: normPath,
      loudnorm: DEFAULT_RENDER.loudnorm,
    });
    const lufs = probeIntegratedLoudnessLufs(normPath, DEFAULT_RENDER.loudnorm);
    expect(Math.abs(lufs - DEFAULT_RENDER.loudnorm.i)).toBeLessThanOrEqual(0.5);

    const c1 = computePartialCacheBundle({
      block: script.blocks[0]!,
      scriptTheme: script.meta.theme,
      width: script.meta.width,
      height: script.meta.height,
      fps: script.meta.fps,
      buildOutDirAbs: buildDir,
      remotionVersion,
    });
    const hit1 = await store.get("partial", c1.cacheKeyHex);
    expect(hit1).not.toBeNull();

    renderMediaCalls.mockClear();

    await renderBlockPartials({
      script: JSON.parse(JSON.stringify(script)) as Script,
      buildOutDirAbs: buildDir,
      cacheStore: store,
      remotionVersion,
      render: { ...DEFAULT_RENDER, blockConcurrency: 2, framesConcurrencyPerBlock: 1 },
      cacheEvictOnStageStart: false,
      verbose: false,
    });

    expect(renderMediaCalls).toHaveBeenCalledTimes(0);
  },
  180_000,
  );
});

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import pLimit from "p-limit";

import { CacheStore } from "../cache/store.js";
import { loadResolvedCliConfig } from "../config/load.js";
import { appendSilence, concatWavs, wavDurationSec } from "../tts/audio.js";
import {
  buildAudioManifestKey,
  computeVoiceRefHash,
  computeVoxcpmModelVersion,
  ttsAudioCacheKey,
} from "../tts/cache-key.js";
import { LINE_TAIL_SILENCE_MS, computeLineTimings } from "../tts/timings.js";
import { VoxcpmClient } from "../tts/voxcpm-client.js";
import { ensureVoxcpmServer } from "../tts/voxcpm-server.js";
import { type Script, scriptSchema } from "../types/script.js";

const KNOWN_SUBCOMMANDS = new Set([
  "build",
  "compile",
  "tts",
  "visuals",
  "render",
  "preview",
  "cache",
  "doctor",
  "init",
]);

export interface TtsCliOptions {
  argv: readonly string[];
  cwd: string;
}

function isFlagArg(a: string): boolean {
  return a.startsWith("-");
}

function extractTtsArgvMeta(argv: readonly string[]): {
  scriptPath: string;
  blockIds: Set<string> | null;
  force: boolean;
  verbose: boolean;
  dryRun: boolean;
} {
  let blockIds: Set<string> | null = null;
  let force = false;
  let verbose = false;
  let dryRun = false;

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--block" || a === "--blocks") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("expected id list after --block");
      }
      blockIds = new Set(
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
      continue;
    }
    if (a.startsWith("--block=")) {
      const raw = a.slice("--block=".length);
      blockIds = new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }

    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--verbose") {
      verbose = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (a === "--config" || a === "--cache-dir" || a === "--meta" || a === "--out") {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        i += 1;
      }
      continue;
    }
    if (a.startsWith("--config=") || a.startsWith("--cache-dir=") || a.startsWith("--meta=")) {
      continue;
    }
  }

  const pos: string[] = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (isFlagArg(a)) {
      if (
        a === "--config" ||
        a === "--cache-dir" ||
        a === "--meta" ||
        a === "--block" ||
        a === "--blocks"
      ) {
        i += 1;
      }
      continue;
    }
    if (KNOWN_SUBCOMMANDS.has(a)) continue;
    pos.push(a);
  }

  const scriptPath = pos[0];
  if (!scriptPath) {
    throw new Error("缺少 script.json 路径");
  }

  return { scriptPath, blockIds, force, verbose, dryRun };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function appendLog(buildOutDir: string, line: string): void {
  const dir = path.join(buildOutDir, "logs");
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const logFile = path.join(dir, `tts-${day}.log`);
  appendFileSync(logFile, `${new Date().toISOString()}\t${line}\n`, "utf8");
}

function parseTtsInputScript(raw: string): Script {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch (e) {
    throw new Error(
      `无法解析 script.json：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const script = scriptSchema.parse(data);
  if (script.meta.schemaVersion !== "1.0") {
    throw new Error(`不支持的 schemaVersion：${script.meta.schemaVersion}`);
  }
  for (const b of script.blocks) {
    if (b.narration.lines.length === 0) {
      throw new Error(`块 ${b.id} 没有旁白行`);
    }
  }
  if (!existsSync(script.meta.voiceRef)) {
    throw new Error(`参考音频不存在：${script.meta.voiceRef}`);
  }
  return script;
}

export async function runTtsCommand(opts: TtsCliOptions): Promise<void> {
  const { argv, cwd } = opts;
  const { config } = loadResolvedCliConfig({ argv, cwd });
  const { scriptPath: _relScript, blockIds, force, verbose, dryRun } =
    extractTtsArgvMeta(argv);
  const relScript = path.normalize(_relScript);

  const scriptAbs = path.resolve(cwd, relScript);
  const buildOutDir = path.dirname(scriptAbs);
  const scriptText = readFileSync(scriptAbs, "utf8");
  let script = parseTtsInputScript(scriptText);

  const blocksToProcess = script.blocks.filter((b) => {
    if (blockIds === null) return true;
    return blockIds.has(b.id);
  });

  if (blocksToProcess.length === 0) {
    throw new Error(
      blockIds === null
        ? "script 中没有块"
        : `没有匹配的块：${[...blockIds].join(", ")}`,
    );
  }

  const voiceRefHash = computeVoiceRefHash(script.meta.voiceRef);
  const voxcpmModelVersion = computeVoxcpmModelVersion(config.voxcpm.modelDir);

  if (dryRun) {
    const lineCount = blocksToProcess.reduce(
      (n, b) => n + b.narration.lines.length,
      0,
    );
    const msg = `[dry-run] tts：${blocksToProcess.length} 块、${lineCount} 行；将写入 public/audio/B**.wav 并更新 script.json`;
    console.error(msg);
    if (verbose) {
      console.error(
        `[dry-run] buildOutDir=${buildOutDir} cache=${config.resolvedCacheDir}`,
      );
    }
    return;
  }

  const store = new CacheStore({
    cacheDir: config.resolvedCacheDir,
    maxSizeGB: config.cache.maxSizeGB,
  });
  await store.ensureLayout();
  await store.evictIfOverLimit({
    triggerStageStart: config.cache.evictTrigger === "stage-start",
  });

  const globalAbort = new AbortController();
  let serverHandle: Awaited<ReturnType<typeof ensureVoxcpmServer>> | undefined;
  let speakCount = 0;

  const tmpRoot = mkdtempSync(path.join(tmpdir(), "autovideo-tts-"));

  try {
    serverHandle = await ensureVoxcpmServer({ voxcpm: config.voxcpm });
    const client = new VoxcpmClient({
      baseUrl: serverHandle.baseUrl,
    });

    const voiceId = await client.registerVoice(script.meta.voiceRef);

    const speakParams = {
      cfgValue: config.voxcpm.cfgValue,
      inferenceTimesteps: config.voxcpm.inferenceTimesteps,
      denoise: config.voxcpm.denoise,
      retryBadcase: config.voxcpm.retryBadcase,
    };

    const limit = pLimit(Math.max(1, config.voxcpm.concurrency));

    const lineJobs: Array<{
      blockId: string;
      lineIndex: number;
      ttsText: string;
      forceMiss: boolean;
    }> = [];

    for (const block of blocksToProcess) {
      const forceMiss = force && (blockIds === null || blockIds.has(block.id));
      block.narration.lines.forEach((line, lineIndex) => {
        lineJobs.push({
          blockId: block.id,
          lineIndex,
          ttsText: line.ttsText,
          forceMiss,
        });
      });
    }

    /** line key `${blockId}\t${lineIndex}` → speech WAV buffer (no tail silence) */
    const speechBuffers = new Map<string, Buffer>();

    await Promise.all(
      lineJobs.map((job) =>
        limit(async () => {
          if (globalAbort.signal.aborted) {
            throw new Error("tts 已取消（同 stage 他处失败）");
          }

          const keyStr = `${job.blockId}\t${String(job.lineIndex)}`;
          const keyMeta = buildAudioManifestKey(
            { ttsText: job.ttsText },
            voiceRefHash,
            config.voxcpm,
            voxcpmModelVersion,
          );
          const cacheKey = ttsAudioCacheKey(keyMeta);

          if (!job.forceMiss) {
            const hit = await store.get("audio", cacheKey);
            if (hit) {
              speechBuffers.set(keyStr, readFileSync(hit));
              return;
            }
          }

          let lastErr: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (globalAbort.signal.aborted) {
              throw new Error("tts 已取消（同 stage 他处失败）");
            }
            try {
              const buf = await client.speak(
                job.ttsText,
                voiceId,
                speakParams,
                { signal: globalAbort.signal },
              );
              speakCount += 1;
              const lineTmp = path.join(
                tmpRoot,
                `speech-${job.blockId}-L${String(job.lineIndex)}.wav`,
              );
              writeFileSync(lineTmp, buf);
              await store.put("audio", cacheKey, lineTmp, keyMeta);
              speechBuffers.set(keyStr, buf);
              lastErr = undefined;
              break;
            } catch (e) {
              lastErr = e;
              if (attempt < 2) {
                await sleep(5000);
              }
            }
          }

          if (lastErr !== undefined) {
            const detail =
              lastErr instanceof Error ? lastErr.message : String(lastErr);
            appendLog(
              buildOutDir,
              `FAIL\tblock=${job.blockId}\tline=${String(job.lineIndex)}\t${detail}`,
            );
            globalAbort.abort();
            throw new Error(
              `块 ${job.blockId} 第 ${String(job.lineIndex + 1)} 行 TTS 在 3 次重试后仍失败：${detail}`,
            );
          }
        }),
      ),
    );

    const audioDir = path.join(buildOutDir, "public", "audio");
    mkdirSync(audioDir, { recursive: true });

    const audioGeneratedAt = new Date().toISOString();

    for (const block of script.blocks) {
      if (!blocksToProcess.some((b) => b.id === block.id)) {
        continue;
      }

      const speechSecs: number[] = [];
      const segments: Buffer[] = [];

      for (let li = 0; li < block.narration.lines.length; li += 1) {
        const keyStr = `${block.id}\t${String(li)}`;
        const buf = speechBuffers.get(keyStr);
        if (!buf) {
          throw new Error(`内部错误：缺行音频 ${block.id} line ${String(li)}`);
        }
        const segPath = path.join(tmpRoot, `dur-${block.id}-${String(li)}.wav`);
        writeFileSync(segPath, buf);
        speechSecs.push(wavDurationSec(segPath));
        segments.push(appendSilence(buf, LINE_TAIL_SILENCE_MS));
      }

      const blockWav = concatWavs(segments);
      const relWav = path.posix.join("public", "audio", `${block.id}.wav`);
      const outAbs = path.join(buildOutDir, ...relWav.split("/"));
      writeFileSync(outAbs, blockWav);

      const durationSec = wavDurationSec(outAbs);
      const lineTimings = computeLineTimings(speechSecs);

      block.audio = {
        wavPath: relWav,
        durationSec,
        lineTimings,
      };
    }

    script.artifacts.audioGeneratedAt = audioGeneratedAt;

    const outText = `${JSON.stringify(script, null, 2)}\n`;
    writeFileSync(scriptAbs, outText, "utf8");
    writeFileSync(path.join(buildOutDir, "public", "script.json"), outText, "utf8");

    if (verbose) {
      console.error(`tts：完成；本次 speak 调用 ${String(speakCount)} 次`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const resumeBlocks = blocksToProcess.map((b) => b.id).join(",");
    console.error(`\n✗ tts 失败：${msg}\n`);
    console.error(
      `Resume after fixing the issue:\n  autovideo tts ${relScript} --block ${resumeBlocks} --force\n`,
    );
    throw e;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    await serverHandle?.dispose();
  }
}

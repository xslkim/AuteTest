import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assertFfmpegOk(
  tool: "ffmpeg" | "ffprobe",
  result: ReturnType<typeof spawnSync>,
): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`${tool} exited ${status}${err ? `: ${err}` : ""}`);
}

/**
 * Append silence (zeros via `apad`) to the end of a WAV blob using ffmpeg stdin/stdout.
 */
export function appendSilence(wavBuffer: Buffer, ms: number): Buffer {
  if (ms <= 0) return Buffer.from(wavBuffer);
  const padSec = (ms / 1000).toFixed(6);
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-af",
      `apad=pad_dur=${padSec}`,
      "-f",
      "wav",
      "-",
    ],
    {
      input: wavBuffer,
      encoding: "buffer",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  assertFfmpegOk("ffmpeg", result);
  if (!result.stdout || result.stdout.length === 0) {
    throw new Error("ffmpeg produced empty stdout");
  }
  return result.stdout;
}

/**
 * Concatenate multiple WAV segments in order (same stream parameters recommended; uses concat demuxer with `-c copy`).
 */
export function concatWavs(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("concatWavs: at least one buffer is required");
  }
  if (buffers.length === 1) {
    return Buffer.from(buffers[0]!);
  }

  const dir = mkdtempSync(join(tmpdir(), "av-concat-wav-"));
  const listPath = join(dir, "list.txt");
  try {
    const lines: string[] = [];
    buffers.forEach((buf, i) => {
      const name = `${i}.wav`;
      writeFileSync(join(dir, name), buf);
      const absPath = join(dir, name).replace(/'/g, "'\\''");
      lines.push(`file '${absPath}'`);
    });
    writeFileSync(listPath, `${lines.join("\n")}\n`);

    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        "-f",
        "wav",
        "-",
      ],
      {
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    assertFfmpegOk("ffmpeg", result);
    if (!result.stdout || result.stdout.length === 0) {
      throw new Error("ffmpeg produced empty stdout");
    }
    return result.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Report container duration in seconds (e.g. WAV) via ffprobe.
 */
export function wavDurationSec(wavPath: string): number {
  if (!existsSync(wavPath)) {
    throw new Error(`wavDurationSec: file not found: ${wavPath}`);
  }
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      wavPath,
    ],
    { encoding: "utf-8" },
  );
  assertFfmpegOk("ffprobe", result);
  const raw = result.stdout.trim();
  const sec = Number.parseFloat(raw);
  if (!Number.isFinite(sec)) {
    throw new Error(`wavDurationSec: invalid duration "${raw}" for ${wavPath}`);
  }
  return sec;
}

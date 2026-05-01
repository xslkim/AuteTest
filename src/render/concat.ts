import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function assertFfprobeOk(result: ReturnType<typeof spawnSync>): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`ffprobe exited ${status}${err ? `: ${err}` : ""}`);
}

function assertFfmpegOk(result: ReturnType<typeof spawnSync>): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`ffmpeg exited ${status}${err ? `: ${err}` : ""}`);
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  sample_aspect_ratio?: string;
  profile?: string;
  level?: number;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
}

interface FfprobeJson {
  streams?: FfprobeStream[];
}

/** Stream parameters that must match across partials for `ffmpeg -f concat -c copy` (PRD §6.4 step 6, §10). */
export interface PartialStreamSignature {
  videoCodec: string;
  width: number;
  height: number;
  pixFmt: string;
  avgFrameRate: string;
  sar: string;
  profile: string;
  level: string;
  audioCodec: string;
  sampleRate: string;
  channels: string;
  channelLayout: string;
}

function ffprobeStreamsJson(mediaPathAbs: string): FfprobeJson {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,sample_aspect_ratio,profile,level,sample_rate,channels,channel_layout",
      "-of",
      "json",
      mediaPathAbs,
    ],
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );
  assertFfprobeOk(result);
  const raw = result.stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`ffprobe JSON parse failed for ${mediaPathAbs}`);
  }
  return parsed as FfprobeJson;
}

function summarizePartialStreams(mediaPathAbs: string, data: FfprobeJson): PartialStreamSignature {
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  if (video == null) {
    throw new Error(
      `partial has no video stream: ${mediaPathAbs}\n` +
        `Hint: re-render this block or clear partial cache (\`autovideo cache clean --type partial\`) and retry.`,
    );
  }

  const missingAudio = audio == null;

  const levelStr =
    video.level != null && Number.isFinite(video.level) ? String(video.level) : "";

  return {
    videoCodec: video.codec_name ?? "",
    width: video.width ?? 0,
    height: video.height ?? 0,
    pixFmt: video.pix_fmt ?? "",
    avgFrameRate: video.avg_frame_rate ?? "",
    sar: video.sample_aspect_ratio ?? "N/A",
    profile: video.profile ?? "",
    level: levelStr,
    audioCodec: missingAudio ? "" : (audio!.codec_name ?? ""),
    sampleRate: missingAudio ? "" : String(audio!.sample_rate ?? ""),
    channels: missingAudio ? "" : String(audio!.channels ?? ""),
    channelLayout: missingAudio ? "" : (audio!.channel_layout ?? ""),
  };
}

function signatureEqual(a: PartialStreamSignature, b: PartialStreamSignature): boolean {
  return (
    a.videoCodec === b.videoCodec &&
    a.width === b.width &&
    a.height === b.height &&
    a.pixFmt === b.pixFmt &&
    a.avgFrameRate === b.avgFrameRate &&
    a.sar === b.sar &&
    a.profile === b.profile &&
    a.level === b.level &&
    a.audioCodec === b.audioCodec &&
    a.sampleRate === b.sampleRate &&
    a.channels === b.channels &&
    a.channelLayout === b.channelLayout
  );
}

function formatSignature(sig: PartialStreamSignature): string {
  return [
    `video=${sig.videoCodec} ${sig.width}x${sig.height} ${sig.pixFmt} @${sig.avgFrameRate} SAR=${sig.sar} profile=${sig.profile} level=${sig.level}`,
    sig.audioCodec
      ? `audio=${sig.audioCodec} ${sig.sampleRate}Hz ch=${sig.channels} layout=${sig.channelLayout}`
      : "audio=(none)",
  ].join("; ");
}

/**
 * PRD §10 — before concat, ensure codec / resolution / fps / pix_fmt / SAR (and audio layout) match every partial.
 */
export function validatePartials(partialPathsAbs: string[]): PartialStreamSignature {
  if (partialPathsAbs.length === 0) {
    throw new Error("validatePartials: at least one partial path is required");
  }

  let ref: PartialStreamSignature | undefined;
  for (const p of partialPathsAbs) {
    if (!existsSync(p)) {
      throw new Error(`validatePartials: file not found: ${p}`);
    }
    const data = ffprobeStreamsJson(p);
    const sig = summarizePartialStreams(p, data);
    if (ref == null) {
      ref = sig;
      continue;
    }
    if (!signatureEqual(ref, sig)) {
      throw new Error(
        [
          `Partial stream parameters mismatch before concat (${path.basename(p)} vs first partial).`,
          `  First: ${formatSignature(ref)}`,
          `  Other: ${formatSignature(sig)}`,
          `Typically caused by stale partial cache after toolchain upgrade; try:`,
          `  autovideo cache clean --type partial`,
        ].join("\n"),
      );
    }
  }
  return ref!;
}

function escapeConcatFileToken(relPathPosix: string): string {
  return relPathPosix.replace(/'/g, "'\\''");
}

export interface ConcatPartialsOptions {
  /** Concatenation order; absolute paths to partial mp4 files. */
  partialPathsAbs: string[];
  /** Build output directory (absolute). Concat runs under `{buildOutDirAbs}/output`. */
  buildOutDirAbs: string;
  /** Concat list + output live here (default `final.mp4`). */
  outputFileName?: string;
}

async function writeConcatDemuxerListFile(
  outputDirAbs: string,
  partialPathsAbs: string[],
): Promise<string> {
  const lines: string[] = [];
  for (const abs of partialPathsAbs) {
    const rel = path.relative(outputDirAbs, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `partial must live under output directory ${outputDirAbs}, got ${abs}`,
      );
    }
    const posixRel = rel.split(path.sep).join("/");
    lines.push(`file '${escapeConcatFileToken(posixRel)}'`);
  }
  const listPathAbs = path.join(outputDirAbs, "concat.txt");
  await writeFile(`${listPathAbs}`, `${lines.join("\n")}\n`, "utf8");
  return listPathAbs;
}

/**
 * PRD §6.4 step 6 — write `output/concat.txt` and concat with stream copy (+genPTS, make_zero timestamps).
 */
export async function concatPartials(options: ConcatPartialsOptions): Promise<void> {
  const {
    partialPathsAbs,
    buildOutDirAbs,
    outputFileName = "final.mp4",
  } = options;

  validatePartials(partialPathsAbs);

  const outputDirAbs = path.join(buildOutDirAbs, "output");
  await mkdir(outputDirAbs, { recursive: true });

  await writeConcatDemuxerListFile(outputDirAbs, partialPathsAbs);

  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-fflags",
      "+genpts",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-y",
      outputFileName,
    ],
    {
      cwd: outputDirAbs,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  assertFfmpegOk(result);

  const outAbs = path.join(outputDirAbs, outputFileName);
  if (!existsSync(outAbs)) {
    throw new Error(`concatPartials: expected output missing: ${outAbs}`);
  }
}

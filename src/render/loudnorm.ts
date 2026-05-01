import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

import type { LoudnormSection } from "../config/types.js";

function assertFfmpegOk(result: ReturnType<typeof spawnSync>, context: string): void {
  const status = result.status ?? 1;
  if (status === 0) return;
  const err = result.stderr?.toString().trim() || result.error?.message || "";
  throw new Error(`ffmpeg ${context} exited ${status}${err ? `: ${err}` : ""}`);
}

/** First-pass `loudnorm` JSON uses `input_*` / `target_offset`; second pass expects `measured_*` / `offset` (PRD §6.4 step 7). */
export interface LoudnormMeasured {
  measuredI: string;
  measuredTp: string;
  measuredLra: string;
  measuredThresh: string;
  offset: string;
}

interface LoudnormJsonRow {
  input_i?: string;
  input_tp?: string;
  input_lra?: string;
  input_thresh?: string;
  target_offset?: string;
}

/**
 * Parse the last balanced `{ ... }` block from ffmpeg stderr (loudnorm `print_format=json`).
 */
export function extractLastJsonObject(stderr: string): string {
  const end = stderr.lastIndexOf("}");
  if (end === -1) {
    throw new Error("loudnorm: no closing brace in ffmpeg stderr");
  }
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    const c = stderr[i];
    if (c === "}") depth++;
    else if (c === "{") {
      depth--;
      if (depth === 0) {
        return stderr.slice(i, end + 1);
      }
    }
  }
  throw new Error("loudnorm: unbalanced braces in ffmpeg stderr");
}

export function parseLoudnormMeasureJson(stderr: string): LoudnormMeasured {
  const raw = extractLastJsonObject(stderr);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`loudnorm: failed to parse JSON from ffmpeg stderr: ${raw.slice(0, 200)}`);
  }
  const row = parsed as LoudnormJsonRow;
  const measuredI = row.input_i?.trim();
  const measuredTp = row.input_tp?.trim();
  const measuredLra = row.input_lra?.trim();
  const measuredThresh = row.input_thresh?.trim();
  const offset = row.target_offset?.trim();
  if (!measuredI || !measuredTp || !measuredLra || !measuredThresh || offset === undefined || offset === "") {
    throw new Error(
      `loudnorm: missing measured fields in JSON (expected input_i/tp/lra/thresh and target_offset): ${raw}`,
    );
  }
  if (
    [measuredI, measuredTp, measuredLra, measuredThresh, offset].some((s) => /inf/i.test(s))
  ) {
    throw new Error(
      `loudnorm: unusable measurement (silent or invalid audio): input_i=${measuredI} target_offset=${offset}`,
    );
  }
  return { measuredI, measuredTp, measuredLra, measuredThresh, offset };
}

function buildLoudnormFilterFirstPass(cfg: LoudnormSection): string {
  return `loudnorm=I=${cfg.i}:TP=${cfg.tp}:LRA=${cfg.lra}:print_format=json`;
}

function buildLoudnormFilterSecondPass(cfg: LoudnormSection, m: LoudnormMeasured): string {
  return [
    `loudnorm=I=${cfg.i}:TP=${cfg.tp}:LRA=${cfg.lra}`,
    `measured_I=${m.measuredI}`,
    `measured_TP=${m.measuredTp}`,
    `measured_LRA=${m.measuredLra}`,
    `measured_thresh=${m.measuredThresh}`,
    `offset=${m.offset}`,
  ].join(":");
}

export interface NormalizeFinalWithLoudnormOptions {
  /** Absolute path to concatenated `final.mp4`. */
  finalPathAbs: string;
  /** Absolute path for `final_normalized.mp4`. */
  outputPathAbs: string;
  loudnorm: LoudnormSection;
}

/**
 * PRD §6.4 step 7 — two-pass loudnorm: measure on stderr, then video copy + AAC re-encode with measured params.
 * If `loudnorm.twoPass` is false, copies `finalPathAbs` to `outputPathAbs` without re-encoding.
 */
export async function normalizeFinalWithLoudnorm(
  options: NormalizeFinalWithLoudnormOptions,
): Promise<void> {
  const { finalPathAbs, outputPathAbs, loudnorm } = options;

  if (!existsSync(finalPathAbs)) {
    throw new Error(`normalizeFinalWithLoudnorm: input missing: ${finalPathAbs}`);
  }

  if (!loudnorm.twoPass) {
    if (path.resolve(finalPathAbs) === path.resolve(outputPathAbs)) {
      return;
    }
    copyFileSync(finalPathAbs, outputPathAbs);
    return;
  }

  const pass1 = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-i",
      finalPathAbs,
      "-af",
      buildLoudnormFilterFirstPass(loudnorm),
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );
  assertFfmpegOk(pass1, "loudnorm pass 1");

  const stderr = `${pass1.stderr ?? ""}`;
  const measured = parseLoudnormMeasureJson(stderr);

  const pass2 = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-i",
      finalPathAbs,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      loudnorm.audioBitrate,
      "-af",
      buildLoudnormFilterSecondPass(loudnorm, measured),
      outputPathAbs,
    ],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );

  assertFfmpegOk(pass2, "loudnorm pass 2");

  if (!existsSync(outputPathAbs)) {
    throw new Error(`normalizeFinalWithLoudnorm: output missing: ${outputPathAbs}`);
  }
}

/** Run a measurement-only loudnorm pass and return integrated loudness of the **input** (`input_i`, LUFS). */
export function probeIntegratedLoudnessLufs(mediaPathAbs: string, cfg: LoudnormSection): number {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-i",
      mediaPathAbs,
      "-af",
      buildLoudnormFilterFirstPass(cfg),
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );
  assertFfmpegOk(r, "loudnorm probe");
  const { measuredI } = parseLoudnormMeasureJson(`${r.stderr ?? ""}`);
  const v = Number.parseFloat(measuredI);
  if (!Number.isFinite(v)) {
    throw new Error(`loudnorm probe: bad input_i: ${measuredI}`);
  }
  return v;
}

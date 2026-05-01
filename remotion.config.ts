import { Config } from "@remotion/cli/config";

/**
 * GOP / IDR alignment for ffmpeg concat (-c copy): each partial must start on an IDR.
 * TASKS T0.1 / PRD §6.4 — Remotion exposes this via FFmpeg x264 keyframe interval.
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const out = [...args];
  const vi = out.findIndex((a) => a === "-vcodec" || a === "-c:v");
  if (vi >= 0 && vi + 1 < out.length && out[vi + 1] === "libx264") {
    const gopIdx = out.indexOf("-g");
    if (gopIdx >= 0 && gopIdx + 1 < out.length) {
      out[gopIdx + 1] = "1";
    } else {
      const insertAt = vi + 2;
      out.splice(insertAt, 0, "-g", "1");
    }
  }
  return out;
});

Config.setVideoImageFormat("jpeg");

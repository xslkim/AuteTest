import { Config } from "@remotion/cli/config";

/**
 * PRD §6.4: every partial must start on an IDR for stream-copy concat.
 * Remotion 4 removed Config.setKeyframeInterval; inject x264 GOP via ffmpeg override.
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    out.push(a!);
    if (a === "-c:v" && args[i + 1] === "libx264") {
      i++;
      out.push(args[i]!);
      out.push("-g", "1", "-keyint_min", "1");
    }
  }
  return out;
});

Config.setVideoImageFormat("jpeg");

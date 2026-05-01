import { Config } from "@remotion/cli/config";

/**
 * Every frame as keyframe → each partial MP4 starts on IDR (§6.4 ffmpeg concat).
 * Remotion 4 no longer exposes setKeyframeInterval; use x264 GOP via FFmpeg override.
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const i = args.indexOf("libx264");
  if (i === -1) {
    return args;
  }
  const next = [...args];
  next.splice(i + 1, 0, "-g", "1", "-keyint_min", "1");
  return next;
});

Config.setVideoImageFormat("jpeg");

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");

// Remotion 4 无 `setKeyframeInterval`；用 x264 参数保证每帧 IDR，便于 ffmpeg `-c copy` concat（PRD §6.4）。
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const out = args.at(-1);
  if (typeof out !== "string") {
    return args;
  }
  return [...args.slice(0, -1), "-x264-params", "keyint=1:min-keyint=1:scenecut=0", out];
});

import { Config } from "@remotion/cli/config";

/**
 * GOP / IDR：PRD §6.4 要求 partial 首帧为 IDR 以便 ffmpeg concat。
 * Remotion 4 已无 Config.setKeyframeInterval；对 stitcher 阶段 libx264 注入 -g 1。
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const next = [...args];
  const encoderIdx = next.indexOf("libx264");
  if (encoderIdx !== -1 && !(next[encoderIdx + 1] === "-g" && next[encoderIdx + 2] === "1")) {
    next.splice(encoderIdx + 1, 0, "-g", "1");
  }
  return next;
});

Config.setVideoImageFormat("jpeg");

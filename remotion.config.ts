import { Config } from "@remotion/cli/config";

/**
 * PRD §6.4：每个 partial 须以 IDR 开头以便 ffmpeg concat。
 * Remotion 4.x 已移除 Config.setKeyframeInterval；对 H.264 stitcher 注入 GOP=1（等同每帧关键帧）。
 */
Config.setVideoImageFormat("jpeg");

Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const cv = args.indexOf("-c:v");
  if (cv === -1 || args[cv + 1] === "copy") {
    return args;
  }
  const movflagsIdx = args.indexOf("-movflags");
  if (movflagsIdx !== -1 && args[movflagsIdx + 1] === "faststart") {
    const next = [...args];
    next.splice(movflagsIdx, 0, "-g", "1");
    return next;
  }
  return args;
});

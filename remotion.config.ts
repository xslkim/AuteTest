import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");

// Remotion 4 已移除 Config.setKeyframeInterval；在 stitcher 阶段为 x264 注入 GOP=1，满足
// PRD §6.4 concat 时每段须以 IDR 开头的要求。
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const cIdx = args.indexOf("-c:v");
  if (cIdx === -1 || args[cIdx + 1] === "copy") {
    return args;
  }
  const out = [...args];
  out.splice(cIdx + 2, 0, "-g", "1", "-keyint_min", "1");
  return out;
});

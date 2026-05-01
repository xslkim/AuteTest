import { Config } from "@remotion/cli/config";

/**
 * PRD §6.4：`remotion.config.ts` 中显式 GOP=1（每帧关键帧），保证 partial 首帧为 IDR、concat 可用 `-c copy`。
 * Remotion v4：`Config.setKeyframeInterval` 已不再提供；等价通过 stitcher 的 FFmpeg 参数注入 `-g 1`.
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") return args;

  const cIdx = args.indexOf("-c:v");
  if (cIdx < 0 || cIdx + 1 >= args.length) return args;

  const encoder = args[cIdx + 1];
  if (encoder !== "libx264") return args;

  const out = [...args];
  out.splice(cIdx + 2, 0, "-g", "1", "-keyint_min", "1");
  return out;
});

Config.setVideoImageFormat("jpeg");

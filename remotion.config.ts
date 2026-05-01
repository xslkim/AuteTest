import { Config } from "@remotion/cli/config";

/** PRD §6.4 GOP：每帧关键帧，partial 首帧为 IDR，便于 ffmpeg `-c copy` concat。Remotion v4 无 `setKeyframeInterval`，改为在 libx264 编码时注入 `-g 1`。 */
Config.overrideFfmpegCommand(({ args }) => {
  const joined = args.join(" ");
  if (!joined.includes("libx264")) {
    return args;
  }
  const out = args.at(-1);
  if (out === undefined || out.startsWith("-")) {
    return args;
  }
  return [...args.slice(0, -1), "-g", "1", "-keyint_min", "1", out];
});

Config.setVideoImageFormat("jpeg");

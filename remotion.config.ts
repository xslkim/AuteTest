import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");

Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const codecIdx = args.indexOf("-c:v");
  if (codecIdx === -1 || args[codecIdx + 1] !== "libx264") {
    return args;
  }
  const next = [...args];
  next.splice(codecIdx + 2, 0, "-g", "1", "-keyint_min", "1", "-sc_threshold", "0");
  return next;
});

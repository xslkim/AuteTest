import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");

/** Every frame as IDR for ffmpeg stream-copy concat (PRD §6.4 step 6). Remotion 4 removed Config.setKeyframeInterval(). */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const libx264Index = args.indexOf("libx264");
  if (libx264Index === -1) {
    return args;
  }
  const next = [...args];
  next.splice(libx264Index + 1, 0, "-g", "1", "-keyint_min", "1");
  return next;
});

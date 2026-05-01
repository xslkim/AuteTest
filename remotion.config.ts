import { Config } from "@remotion/cli/config";

/** Remotion v4 removes `Config.setKeyframeInterval`; inject libx264 GOP so each frame is an IDR (§6.4 concat). */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "pre-stitcher") {
    return args;
  }
  const i = args.findIndex((a, j) => j > 0 && args[j - 1] === "-c:v" && a === "libx264");
  if (i === -1) {
    return args;
  }
  const next = [...args];
  next.splice(i + 1, 0, "-x264-params", "keyint=1:min-keyint=1:scenecut=0:no-mbtree=1");
  return next;
});

Config.setVideoImageFormat("jpeg");

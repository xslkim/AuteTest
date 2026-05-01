import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");

/**
 * Remotion v4 removed Config.setKeyframeInterval. For H.264 partials we inject
 * libx264 GOP=1 so each segment can be concat with -c copy (§6.4).
 */
function injectLibx264KeyframeEveryFrame(args: string[]): string[] {
  const next = [...args];
  for (let i = 0; i < next.length - 1; i++) {
    if (next[i] === "-c:v" && next[i + 1] === "libx264") {
      next.splice(i + 2, 0, "-g", "1", "-keyint_min", "1");
      break;
    }
  }
  return next;
}

Config.overrideFfmpegCommand(({ type, args }) => {
  if (type === "pre-stitcher" || type === "stitcher") {
    return injectLibx264KeyframeEveryFrame(args);
  }
  return args;
});

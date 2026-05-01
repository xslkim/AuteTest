import { Config } from "@remotion/cli/config";

/**
 * Every frame is an IDR keyframe — required for stream-copy concat across partial MP4s (PRD §6.4 step 6).
 * Remotion 4.x no longer exposes Config.setKeyframeInterval; inject x264 params on software libx264 only.
 */
Config.overrideFfmpegCommand(({ args }) => {
  const next = [...args];
  for (let i = 0; i < next.length - 1; i++) {
    if (next[i] === "-c:v" && next[i + 1] === "libx264") {
      next.splice(i + 2, 0, "-x264-params", "keyint=1:min-keyint=1:scenecut=0");
      break;
    }
  }
  return next;
});

Config.setVideoImageFormat("jpeg");

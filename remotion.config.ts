import { Config } from "@remotion/cli/config";

/**
 * PRD §6.4: 每帧关键帧 / GOP=1，便于 ffmpeg concat 流复制时每段以 IDR 开头。
 * Remotion 4 的 Config 无 setKeyframeInterval；对 stitcher 阶段的 libx264 注入 -g 1。
 */
function injectLibx264Gop1(args: string[]): string[] {
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
  if (type !== "stitcher") {
    return args;
  }
  return injectLibx264Gop1(args);
});

Config.setVideoImageFormat("jpeg");

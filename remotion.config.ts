import { Config } from "@remotion/cli/config";

/**
 * Remotion 4.x `FlatConfig` 无 `setKeyframeInterval`。
 * GOP=1（每帧关键帧）通过 libx264 的 `-g 1` 实现，以满足 §6.4 concat + IDR 要求。
 */
Config.overrideFfmpegCommand(({ args }) => {
  const next = [...args];
  const cvi = next.findIndex((a, idx) => a === "-c:v" && next[idx + 1] === "libx264");
  if (cvi !== -1 && !next.includes("-g")) {
    next.splice(cvi + 2, 0, "-g", "1", "-keyint_min", "1", "-sc_threshold", "0");
  }
  return next;
});

Config.setVideoImageFormat("jpeg");

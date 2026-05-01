import { Config } from '@remotion/cli/config';

/**
 * PRD §6.4：`-c copy` concat 要求每段 mp4 以 IDR 开头。Remotion 4 不再导出
 * `Config.setKeyframeInterval()`；对 libx264 stitch 注入 GOP=1 达到等价效果。
 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== 'stitcher') {
    return args;
  }
  const next = [...args];
  const i = next.findIndex((a, idx) => a === '-c:v' && next[idx + 1] === 'libx264');
  if (i !== -1) {
    next.splice(i + 2, 0, '-g', '1', '-keyint_min', '1', '-sc_threshold', '0');
  }
  return next;
});

Config.setVideoImageFormat('jpeg');

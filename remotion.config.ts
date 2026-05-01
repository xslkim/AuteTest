import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
/** NodeNext 源码用 `.js` 后缀导入 TS 模块；Webpack 需映射到 `.ts`/`.tsx` */
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
}));

/** PRD §6.4：Remotion 4.x 移除 `setKeyframeInterval`；在 stitcher 为 libx264 强制 GOP=1 */
Config.overrideFfmpegCommand(({ type, args }) => {
  if (type !== "stitcher") {
    return args;
  }
  const i = args.findIndex((a, idx) => a === "-c:v" && args[idx + 1] === "libx264");
  if (i < 0) {
    return args;
  }
  const next = [...args];
  next.splice(i + 2, 0, "-g", "1", "-keyint_min", "1");
  return next;
});

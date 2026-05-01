import { Config } from "@remotion/cli/config";

/**
 * autovideo `--cwd=<build>` Studio/render 入口：`AUTVIDEO_REMOTION_ENTRY`
 *（preview：`remotion-root-preview.tsx`；render：`remotion-root.tsx`）。
 * 不设时使用仓库默认路径探测。
 */
const remotionEntry = process.env.AUTVIDEO_REMOTION_ENTRY?.trim();
if (remotionEntry && remotionEntry.length > 0) {
  Config.setEntryPoint(remotionEntry);
}

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

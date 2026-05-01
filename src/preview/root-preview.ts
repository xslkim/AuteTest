import type { Script } from "../types/script.js";

export interface GeneratePreviewRootTsxOptions {
  /**
   * `remotion-root-preview.tsx` → `remotion/VideoComposition` 的模块路径（POSIX、无 `.tsx` 后缀）。
   */
  blockCompositionImportPath?: string;
  /** `blockLoaders` 表的 import（POSIX）。默认 `./src/remotion-block-imports`。 */
  blockLoadersImportPath?: string;
}

/**
 * 生成 preview 阶段写入 build out 的 Root：每块一个 `Composition`，id 与块 ID 一致（§6.5）。
 * `./public/script.json` 相对该文件所在目录。
 */
export function generatePreviewRootTsx(
  script: Script,
  options: GeneratePreviewRootTsxOptions = {},
): string {
  const blockCompositionImport =
    options.blockCompositionImportPath ?? "../../remotion/VideoComposition";
  const blockLoadersImport = options.blockLoadersImportPath ?? "./src/remotion-block-imports";

  return `import { registerRoot, Composition } from 'remotion';
import { BlockComposition, previewCompositionDurationFrames } from '${blockCompositionImport}';
import { blockLoaders } from '${blockLoadersImport}';
import script from './public/script.json';

export const Root = () => (
  <>
    {script.blocks.map((block) => (
      <Composition
        key={block.id}
        id={block.id}
        component={() => (
          <BlockComposition blockId={block.id} blockLoaders={blockLoaders} />
        )}
        durationInFrames={previewCompositionDurationFrames(block, script.meta.fps)}
        fps={script.meta.fps}
        width={script.meta.width}
        height={script.meta.height}
      />
    ))}
  </>
);
registerRoot(Root);
`;
}

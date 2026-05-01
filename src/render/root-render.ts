import type { Block, Script } from "../types/script.js";

function assertBlockHasTiming(
  block: Block,
): asserts block is Block & { timing: NonNullable<Block["timing"]> } {
  if (block.timing == null) {
    throw new Error(`generateRenderRootTsx: block "${block.id}" is missing timing (compute timing before generating remotion-root.tsx)`);
  }
}

export interface GenerateRenderRootTsxOptions {
  /**
   * `remotion-root.tsx` → `remotion/VideoComposition` 的模块路径（POSIX、无 `.tsx` 后缀）。
   * 省略时默认 `../../remotion/VideoComposition`（`build/{slug}/` 位于仓库内时）。
   */
  blockCompositionImportPath?: string;
  /**
   * `blockLoaders` 表的 import（POSIX）。默认 `./src/remotion-block-imports`（文件由 render 阶段生成）。
   */
  blockLoadersImportPath?: string;
}

/**
 * 生成 render 阶段写入 `<build out>/remotion-root.tsx` 的源码。
 * `./public/script.json` 相对该文件所在目录（build out dir）。
 */
export function generateRenderRootTsx(
  script: Script,
  options: GenerateRenderRootTsxOptions = {},
): string {
  for (const block of script.blocks) {
    assertBlockHasTiming(block);
  }

  const blockCompositionImport =
    options.blockCompositionImportPath ?? "../../remotion/VideoComposition";
  const blockLoadersImport = options.blockLoadersImportPath ?? "./src/remotion-block-imports";

  return `import { registerRoot, Composition } from 'remotion';
import { BlockComposition } from '${blockCompositionImport}';
import { blockLoaders } from '${blockLoadersImport}';
import script from './public/script.json';

export const Root = () => (
  <Composition
    id="Block"
    component={(props) => (
      <BlockComposition blockId={props.blockId} blockLoaders={blockLoaders} />
    )}
    durationInFrames={1}
    fps={script.meta.fps}
    width={script.meta.width}
    height={script.meta.height}
    defaultProps={{ blockId: script.blocks[0].id }}
    calculateMetadata={({ props }) => {
      const block = script.blocks.find(b => b.id === props.blockId);
      return { durationInFrames: block.timing.frames };
    }}
  />
);
registerRoot(Root);
`;
}

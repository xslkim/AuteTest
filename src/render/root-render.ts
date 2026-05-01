import type { Block, Script } from "../types/script.js";

function assertBlockHasTiming(
  block: Block,
): asserts block is Block & { timing: NonNullable<Block["timing"]> } {
  if (block.timing == null) {
    throw new Error(`generateRenderRootTsx: block "${block.id}" is missing timing (compute timing before generating remotion-root.tsx)`);
  }
}

/**
 * 生成 render 阶段写入 `<build out>/remotion-root.tsx` 的源码。
 * cwd 为 build out dir 时，`./public/script.json` 与 `../../remotion/VideoComposition` 路径与 PRD §8.3 / TASKS T6.1 一致。
 */
export function generateRenderRootTsx(script: Script): string {
  for (const block of script.blocks) {
    assertBlockHasTiming(block);
  }

  return `import { registerRoot, Composition } from 'remotion';
import { BlockComposition } from '../../remotion/VideoComposition';
import script from './public/script.json';

export const Root = () => (
  <Composition
    id="Block"
    component={BlockComposition}
    durationInFrames={1}
    fps={script.meta.fps}
    width={script.meta.width}
    height={script.meta.height}
    defaultProps={{ blockId: script.blocks[0].id }}
    calculateMetadata={({ inputProps }) => {
      const block = script.blocks.find(b => b.id === inputProps.blockId);
      return { durationInFrames: block.timing.frames };
    }}
  />
);
registerRoot(Root);
`;
}

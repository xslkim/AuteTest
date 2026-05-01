import path from "node:path";

import type { Script } from "../types/script.js";

/** Options for resolving `AnimationProps` import in the generated file */
export interface GenerateRemotionBlockImportsOptions {
  /** Directory containing `remotion-block-imports.ts` — typically `<build>/src` */
  importsFileDirAbs: string;
  /** Repository root (contains `src/types/script.ts`) */
  repoRootAbs: string;
}

/**
 * Generate `<build out>/src/remotion-block-imports.ts`.
 * Webpack cannot reliably emit chunks for fully dynamic `@autovideo-blocks/${id}/Component`;
 * this explicit map yields one chunk per block.
 */
export function generateRemotionBlockImportsTs(
  script: Script,
  opts: GenerateRemotionBlockImportsOptions,
): string {
  let typeRel = path.relative(opts.importsFileDirAbs, path.join(opts.repoRootAbs, "src/types/script.js"));
  typeRel = typeRel.split(path.sep).join("/");
  if (!typeRel.startsWith(".")) {
    typeRel = `./${typeRel}`;
  }

  const lines: string[] = [
    `import type { ComponentType } from "react";`,
    `import type { AnimationProps } from "${typeRel}";`,
    ``,
    `export const blockLoaders: Record<string, () => Promise<{ default: ComponentType<AnimationProps> }>> = {`,
  ];

  const seen = new Set<string>();
  for (const block of script.blocks) {
    if (seen.has(block.id)) continue;
    seen.add(block.id);
    lines.push(
      `  ${JSON.stringify(block.id)}: () => import("./blocks/${block.id}/Component.js"),`,
    );
  }

  lines.push(`};`, ``);
  return lines.join("\n");
}

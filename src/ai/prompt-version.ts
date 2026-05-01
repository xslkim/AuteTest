import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** MD5(component.md) hex，前 8 位 — 与 PRD §11.2 `promptVersion` 一致 */
export function md5PrefixFromPromptBytes(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex").slice(0, 8);
}

export async function readComponentPromptMd5Prefix(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const componentMdPath = join(here, "prompts", "component.md");
  const buf = await readFile(componentMdPath);
  return md5PrefixFromPromptBytes(buf);
}

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  md5PrefixFromPromptBytes,
  readComponentPromptMd5Prefix,
} from "../src/ai/prompt-version.js";

describe("promptVersion (component.md)", () => {
  it("matches manual MD5 hex prefix of file bytes", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const mdPath = join(root, "..", "src", "ai", "prompts", "component.md");
    const buf = readFileSync(mdPath);
    const manual = createHash("md5").update(buf).digest("hex").slice(0, 8);

    expect(md5PrefixFromPromptBytes(buf)).toBe(manual);
    await expect(readComponentPromptMd5Prefix()).resolves.toBe(manual);
  });

  it("is stable across repeated reads", async () => {
    const a = await readComponentPromptMd5Prefix();
    const b = await readComponentPromptMd5Prefix();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});

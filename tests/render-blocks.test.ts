import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateRemotionBlockImportsTs } from "../src/render/block-imports.js";
import { partialCacheKeyHex } from "../src/render/partial-cache-key.js";
import type { Script } from "../src/types/script.js";

describe("partial-cache-key", () => {
  it("partialCacheKeyHex is stable for fixed parts", () => {
    const a = partialCacheKeyHex({
      componentHash: "aa",
      audioHash: "bb",
      theme: "dark-code",
      width: 1920,
      height: 1080,
      fps: 30,
      enter: "fade-up",
      exit: "fade",
      remotionVersion: "4.0.0",
    });
    const b = partialCacheKeyHex({
      componentHash: "aa",
      audioHash: "bb",
      theme: "dark-code",
      width: 1920,
      height: 1080,
      fps: 30,
      enter: "fade-up",
      exit: "fade",
      remotionVersion: "4.0.0",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it("changing enter preset changes key", () => {
    const base = {
      componentHash: "aa",
      audioHash: "bb",
      theme: "dark-code",
      width: 1920,
      height: 1080,
      fps: 30,
      exit: "fade",
      remotionVersion: "4.0.0",
    };
    const k1 = partialCacheKeyHex({ ...base, enter: "fade-up" });
    const k2 = partialCacheKeyHex({ ...base, enter: "fade" });
    expect(k1).not.toBe(k2);
  });
});

describe("generateRemotionBlockImportsTs", () => {
  it("emits static imports to repo types and per-block Component", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const importsDir = join(repoRoot, "build", "stub", "src");
    const script = {
      blocks: [{ id: "B01" }, { id: "B02" }],
    } as unknown as Script;
    const out = generateRemotionBlockImportsTs(script, {
      importsFileDirAbs: importsDir,
      repoRootAbs: repoRoot,
    });
    expect(out).toContain(
      'import type { AnimationProps } from "../../../src/types/script.js";',
    );
    expect(out).toContain('B01": () => import("./blocks/B01/Component.js")');
    expect(out).toContain('B02": () => import("./blocks/B02/Component.js")');
  });
});

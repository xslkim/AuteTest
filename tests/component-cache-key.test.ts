import { describe, expect, it } from "vitest";

import {
  assetHashesJsonFromVisualDescription,
  computeComponentCacheBundle,
  visualDescriptionMd5Hex,
} from "../src/ai/component-cache-key.js";

describe("assetHashesJsonFromVisualDescription", () => {
  it("extracts sorted unique 8-hex hashes from assets/ paths", () => {
    const d = `See assets/a1b2c3d4.png and assets/bbbbcccc.jpg plus assets/a1b2c3d4.gif`;
    expect(assetHashesJsonFromVisualDescription(d)).toBe(
      JSON.stringify(["a1b2c3d4", "bbbbcccc"]),
    );
  });

  it("returns empty JSON array when no assets refs", () => {
    expect(assetHashesJsonFromVisualDescription("plain text")).toBe("[]");
  });
});

describe("computeComponentCacheBundle", () => {
  it("matches PRD §11.2 concatenation (stable key for same inputs)", () => {
    const a = computeComponentCacheBundle({
      theme: "dark-code",
      width: 1920,
      height: 1080,
      promptVersion: "abcd1234",
      claudeModel: "claude-sonnet-4-6",
      visualDescription: "hello",
    });
    const b = computeComponentCacheBundle({
      theme: "dark-code",
      width: 1920,
      height: 1080,
      promptVersion: "abcd1234",
      claudeModel: "claude-sonnet-4-6",
      visualDescription: "hello",
    });
    expect(a.cacheKeyHex).toBe(b.cacheKeyHex);
    expect(a.manifestKey.descriptionHash).toBe(visualDescriptionMd5Hex("hello"));
  });
});

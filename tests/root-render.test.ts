import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateRenderRootTsx } from "../src/render/root-render.js";
import type { Script } from "../src/types/script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("generateRenderRootTsx", () => {
  it("matches snapshot for script with block timing", async () => {
    const raw = await readFile(join(__dirname, "fixtures/minimal-script.json"), "utf8");
    const script = JSON.parse(raw) as Script;
    script.blocks[0]!.timing = {
      enterSec: 0.5,
      holdSec: 2,
      exitSec: 0.3,
      totalSec: 2.8,
      frames: 84,
      enterFrames: 15,
    };

    expect(generateRenderRootTsx(script)).toMatchSnapshot();
  });

  it("throws when any block lacks timing", async () => {
    const raw = await readFile(join(__dirname, "fixtures/minimal-script.json"), "utf8");
    const script = JSON.parse(raw) as Script;

    expect(() => generateRenderRootTsx(script)).toThrow(/missing timing/);
  });
});

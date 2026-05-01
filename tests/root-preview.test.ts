import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generatePreviewRootTsx } from "../src/preview/root-preview.js";
import type { Block, Script } from "../src/types/script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("generatePreviewRootTsx", () => {
  it("matches snapshot for multiple blocks without timing", async () => {
    const raw = await readFile(join(__dirname, "fixtures/minimal-script.json"), "utf8");
    const script = JSON.parse(raw) as Script;
    const b2: Block = {
      id: "B02",
      title: "第二块",
      enter: "fade-up",
      exit: "none",
      visual: { description: "占位" },
      narration: {
        lines: [
          { text: "第一行", ttsText: "第一行", highlights: [] },
          { text: "第二行", ttsText: "第二行", highlights: [] },
        ],
      },
    };
    script.blocks.push(b2);

    expect(generatePreviewRootTsx(script)).toMatchSnapshot();
  });
});

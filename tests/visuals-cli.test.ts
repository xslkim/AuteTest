import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai/component-gen.js", () => ({
  generateComponentTsx: vi.fn(),
}));

vi.mock("../src/ai/validate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ai/validate.js")>();
  return {
    ...actual,
    validateRenderSmoke: vi.fn().mockResolvedValue({ ok: true }),
  };
});

import { generateComponentTsx } from "../src/ai/component-gen.js";
import { runVisualsCommand } from "../src/cli/visuals.js";

const goodTsx = `import React from "react";

export default function Good(props: AnimationProps) {
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        backgroundColor: "rgb(200, 60, 80)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 48,
      }}
    >
      Smoke
    </div>
  );
}
`;

const badTsxTypeError = `import React from "react";

export default function Bad(props: AnimationProps) {
  const x: string = props.width;
  return <div>{x}</div>;
}
`;

function minimalScriptTwoBlocks(): object {
  return {
    meta: {
      schemaVersion: "1.0",
      title: "visuals-cli-test",
      voiceRef: "",
      aspect: "16:9",
      width: 320,
      height: 180,
      fps: 30,
      theme: "dark-code",
      subtitleSafeBottom: 27,
    },
    blocks: [
      {
        id: "B01",
        title: "One",
        enter: "fade",
        exit: "fade",
        visual: { description: "第一个块" },
        narration: {
          lines: [{ text: "a", ttsText: "a", highlights: [] }],
        },
      },
      {
        id: "B02",
        title: "Two",
        enter: "fade",
        exit: "fade",
        visual: { description: "第二个块" },
        narration: {
          lines: [{ text: "b", ttsText: "b", highlights: [] }],
        },
      },
    ],
    artifacts: {},
    assets: {},
  };
}

describe("runVisualsCommand", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  let root: string;
  let cacheDir: string;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.mocked(generateComponentTsx).mockReset();
    root = mkdtempSync(path.join(tmpdir(), "av-visuals-cli-"));
    cacheDir = path.join(root, "cache");
    mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
    vi.clearAllMocks();
  });

  it("E2E mock: first attempt type error, second succeeds; writes Component.tsx + componentPath", async () => {
    const scriptPath = path.join(root, "script.json");
    const data = minimalScriptTwoBlocks() as Record<string, unknown>;
    (data.meta as Record<string, string>).voiceRef = path.join(root, "B00.wav");
    writeFileSync((data.meta as Record<string, string>).voiceRef, Buffer.alloc(8));
    writeFileSync(scriptPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    let n = 0;
    vi.mocked(generateComponentTsx).mockImplementation(async () => {
      n += 1;
      if (n === 1) {
        return {
          tsx: badTsxTypeError,
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
          cacheHit: false,
        };
      }
      return {
        tsx: goodTsx,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
        cacheHit: false,
      };
    });

    await runVisualsCommand({
      cwd: root,
      argv: [
        "node",
        "autovideo",
        "visuals",
        "script.json",
        `--cache-dir`,
        cacheDir,
      ],
    });

    expect(generateComponentTsx).toHaveBeenCalled();
    /* B01：首轮错误 + 次轮通过；B02：首轮通过 → 合计 3 次 API */
    expect(n).toBe(3);

    const out = JSON.parse(readFileSync(scriptPath, "utf8")) as {
      blocks: Array<{ id: string; visual: { componentPath?: string } }>;
    };
    expect(out.blocks[0]!.visual.componentPath).toBe("src/blocks/B01/Component.tsx");
    expect(out.blocks[1]!.visual.componentPath).toBe("src/blocks/B02/Component.tsx");

    const c1 = readFileSync(path.join(root, "src", "blocks", "B01", "Component.tsx"), "utf8");
    expect(c1).toContain("Smoke");
    const c2 = readFileSync(path.join(root, "src", "blocks", "B02", "Component.tsx"), "utf8");
    expect(c2).toContain("Smoke");
  });

  it("3 failed rounds: exits non-zero path and does not start second block", async () => {
    const scriptPath = path.join(root, "script.json");
    const data = minimalScriptTwoBlocks() as Record<string, unknown>;
    (data.meta as Record<string, string>).voiceRef = path.join(root, "B00.wav");
    writeFileSync((data.meta as Record<string, string>).voiceRef, Buffer.alloc(8));
    writeFileSync(scriptPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    vi.mocked(generateComponentTsx).mockResolvedValue({
      tsx: badTsxTypeError,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
      cacheHit: false,
    });

    await expect(
      runVisualsCommand({
        cwd: root,
        argv: [
          "node",
          "autovideo",
          "visuals",
          "script.json",
          `--cache-dir`,
          cacheDir,
        ],
      }),
    ).rejects.toThrow(/3 轮/);

    expect(generateComponentTsx).toHaveBeenCalledTimes(3);

    const b2path = path.join(root, "src", "blocks", "B02", "Component.tsx");
    expect(() => readFileSync(b2path, "utf8")).toThrow();
  });
});

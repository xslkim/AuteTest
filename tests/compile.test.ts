import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath, resolve as resolvePath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileProjectToScript } from "../src/cli/compile.js";
import { slugifyTitle } from "../src/util/slugify.js";

const FIXTURE_ROOT = resolvePath(import.meta.dirname, "fixtures", "t15-project");
const FIXED_ISO = "2026-05-01T12:34:56.789Z";

describe("slugifyTitle", () => {
  it("converts mixed CJK/Latin titles for path-safe slug", () => {
    expect(slugifyTitle("  演示 / 第一课 Hello  ")).toMatchSnapshot();
  });
});

describe("compile fixture", () => {
  let workDir = "";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("2 blocks + asset → stable CompiledScript snapshot", () => {
    vi.useFakeTimers({ now: new Date(FIXED_ISO) });

    workDir = joinPath(
      tmpdir(),
      `av-compile-t15-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(workDir, { recursive: true });
    const buildOutAbs = resolvePath(workDir, "build", "fixture-out");
    mkdirSync(joinPath(buildOutAbs, "public", "assets"), { recursive: true });
    mkdirSync(joinPath(workDir, "extra", "pix"), { recursive: true });

    writeFileSync(
      joinPath(workDir, "project.json"),
      JSON.stringify({
        meta: "./extra/meta.md",
        blocks: ["./extra/part1.md", "./extra/part2.md"],
      }),
      "utf8",
    );

    writeFileSync(
      joinPath(workDir, "extra", "meta.md"),
      readFileSync(joinPath(FIXTURE_ROOT, "meta.md"), "utf8"),
    );
    writeFileSync(
      joinPath(workDir, "extra", "B00.wav"),
      readFileSync(joinPath(FIXTURE_ROOT, "B00.wav")),
    );
    writeFileSync(
      joinPath(workDir, "extra", "pix", "diagram.png"),
      readFileSync(joinPath(FIXTURE_ROOT, "assets", "diagram.png")),
    );

    writeFileSync(
      joinPath(workDir, "extra", "part1.md"),
      `>>> Block Alpha #B01
@enter: fade

--- visual ---
显示图片 ./pix/diagram.png

--- narration ---
第一行字幕
这里有 **强调** 词

`,
    );
    writeFileSync(
      joinPath(workDir, "extra", "part2.md"),
      `>>> Block Beta #B02
--- visual ---
纯白背景

--- narration ---
Beta 单行

`,
    );

    const projectJsonAbs = resolvePath(workDir, "project.json");

    const { script } = compileProjectToScript({
      projectJsonPath: projectJsonAbs,
      cwd: workDir,
      buildOutDirAbs: buildOutAbs,
    });

    expect(script.assets).toEqual({
      "extra/pix/diagram.png": "assets/8feea4e2.png",
    });
    expect({
      ...script,
      meta: { ...script.meta, voiceRef: "<absolute path stripped>" },
    }).toMatchSnapshot();
  });

  it("script-microgpt-part1-1 layout: markdown + png under project root → valid CompiledScript", () => {
    const root = joinPath(
      tmpdir(),
      `av-micro-e2e-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(joinPath(root, "gpt", "pix"), { recursive: true });

    writeFileSync(
      joinPath(root, "gpt", "meta.md"),
      readFileSync(joinPath(FIXTURE_ROOT, "meta.md")),
    );
    writeFileSync(
      joinPath(root, "gpt", "B00.wav"),
      readFileSync(joinPath(FIXTURE_ROOT, "B00.wav")),
    );
    writeFileSync(
      joinPath(root, "gpt", "pix", "diagram.png"),
      readFileSync(joinPath(FIXTURE_ROOT, "assets", "diagram.png")),
    );

    writeFileSync(
      joinPath(root, "gpt", "script-microgpt-part1-1.md"),
      `
>>> GPT 是什么 #B01
--- visual ---
屏幕中央标题

--- narration ---
本质就是预测器

>>> LayerNorm #B02
--- visual ---
显示图片 ./pix/diagram.png

--- narration ---
两行
这里有 **LN**
`,
    );

    writeFileSync(
      joinPath(root, "gpt", "micro-project.json"),
      JSON.stringify({
        meta: "./meta.md",
        blocks: ["./script-microgpt-part1-1.md"],
      }),
    );

    vi.useFakeTimers({ now: new Date(FIXED_ISO) });

    const projectJsonAbs = resolvePath(root, "gpt", "micro-project.json");
    const buildOutAbs = resolvePath(root, "gpt", "build-out");
    mkdirSync(joinPath(buildOutAbs, "public", "assets"), { recursive: true });

    const { script } = compileProjectToScript({
      projectJsonPath: projectJsonAbs,
      cwd: root,
      buildOutDirAbs: buildOutAbs,
    });

    expect(script.blocks).toHaveLength(2);
    expect(script.blocks[1]?.visual.description).toContain("assets/8feea4e2.png");
    expect(script.assets["pix/diagram.png"]).toBe("assets/8feea4e2.png");
    expect(existsSync(joinPath(buildOutAbs, "public", "assets", "8feea4e2.png"))).toBe(true);
  });
});

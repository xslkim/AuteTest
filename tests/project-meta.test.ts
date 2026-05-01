import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMetaFile } from "../src/parser/meta.js";
import { loadProjectFile } from "../src/parser/project.js";

function mkRoot(): string {
  return join(
    tmpdir(),
    `autovideo-t11-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe("loadProjectFile", () => {
  it("rejects missing meta field", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const pj = join(root, "project.json");
    writeFileSync(
      pj,
      JSON.stringify({ blocks: ["./a.md"] }),
      "utf8",
    );
    expect(() => loadProjectFile(pj, root)).toThrow(/缺少非空字符串字段 meta/);
  });

  it("rejects empty blocks array", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const pj = join(root, "project.json");
    writeFileSync(
      pj,
      JSON.stringify({ meta: "./meta.md", blocks: [] }),
      "utf8",
    );
    expect(() => loadProjectFile(pj, root)).toThrow(/blocks 必须为非空/);
  });

  it("rejects unknown top-level keys in project.json", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const pj = join(root, "project.json");
    writeFileSync(
      pj,
      JSON.stringify({
        meta: "./meta.md",
        blocks: ["./a.md"],
        extra: 1,
      }),
      "utf8",
    );
    writeFileSync(join(root, "meta.md"), "--- meta ---\n---\n", "utf8");
    writeFileSync(join(root, "a.md"), "\n", "utf8");
    expect(() => loadProjectFile(pj, root)).toThrow(/仅允许 meta \/ blocks/);
  });

  it("resolves meta and block paths to absolute and checks existence", () => {
    const root = mkRoot();
    mkdirSync(join(root, "sub"), { recursive: true });
    const pj = join(root, "sub", "project.json");
    writeFileSync(
      pj,
      JSON.stringify({
        meta: "../meta.md",
        blocks: ["../blocks/one.md"],
      }),
      "utf8",
    );
    writeFileSync(join(root, "meta.md"), "--- meta ---\n---\n", "utf8");
    mkdirSync(join(root, "blocks"), { recursive: true });
    writeFileSync(join(root, "blocks", "one.md"), "\n", "utf8");

    const loaded = loadProjectFile(pj, root);
    expect(loaded.projectRootDir).toBe(join(root, "sub"));
    expect(loaded.projectFilePath).toBe(pj);
    expect(loaded.metaPathAbs).toBe(join(root, "meta.md"));
    expect(loaded.blockPathsAbs).toEqual([join(root, "blocks", "one.md")]);
  });
});

describe("parseMetaFile", () => {
  it("requires title", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const metaPath = join(root, "meta.md");
    writeFileSync(
      metaPath,
      `--- meta ---
aspect: 16:9
---
`,
      "utf8",
    );
    expect(() =>
      parseMetaFile({ metaMdPath: metaPath, projectRootDir: root }),
    ).toThrow(/缺少必填字段 title/);
  });

  it("defaults voiceRef to ./B00.wav next to meta.md and resolves absolute", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const metaPath = join(root, "meta.md");
    const wav = join(root, "B00.wav");
    writeFileSync(wav, "fake", "utf8");
    writeFileSync(
      metaPath,
      `--- meta ---
title: Hello
---
`,
      "utf8",
    );
    const r = parseMetaFile({ metaMdPath: metaPath, projectRootDir: root });
    expect(r.voiceRef).toBe(wav);
    expect(r.aspect).toBe("16:9");
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.fps).toBe(30);
    expect(r.theme).toBe("dark-code");
    expect(r.subtitleSafeBottom).toBe(162);
  });

  it("applies CLI overrides for title, fps, and voiceRef path", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const metaPath = join(root, "meta.md");
    const wavDefault = join(root, "B00.wav");
    const wavCli = join(root, "alt.wav");
    writeFileSync(wavDefault, "a", "utf8");
    writeFileSync(wavCli, "b", "utf8");
    writeFileSync(
      metaPath,
      `--- meta ---
title: FromFile
fps: 24
---
`,
      "utf8",
    );
    const r = parseMetaFile({
      metaMdPath: metaPath,
      projectRootDir: root,
      metaOverrides: {
        title: "CliTitle",
        fps: 60,
        voiceRef: "./alt.wav",
      },
    });
    expect(r.title).toBe("CliTitle");
    expect(r.fps).toBe(60);
    expect(r.voiceRef).toBe(wavCli);
  });

  it("fails when default B00.wav is missing", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const metaPath = join(root, "meta.md");
    writeFileSync(
      metaPath,
      `--- meta ---
title: T
---
`,
      "utf8",
    );
    expect(() =>
      parseMetaFile({ metaMdPath: metaPath, projectRootDir: root }),
    ).toThrow(/voiceRef 文件不存在或不可读/);
  });

  it("parses aspect dimensions for 9:16 and 1:1", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const wav = join(root, "B00.wav");
    writeFileSync(wav, "x", "utf8");

    const meta916 = join(root, "m916.md");
    writeFileSync(
      meta916,
      `--- meta ---
title: T
aspect: 9:16
---
`,
      "utf8",
    );
    const a = parseMetaFile({ metaMdPath: meta916, projectRootDir: root });
    expect(a.aspect).toBe("9:16");
    expect(a.width).toBe(1080);
    expect(a.height).toBe(1920);
    expect(a.subtitleSafeBottom).toBe(288);

    const meta11 = join(root, "m11.md");
    writeFileSync(
      meta11,
      `--- meta ---
title: T2
aspect: 1:1
---
`,
      "utf8",
    );
    const b = parseMetaFile({ metaMdPath: meta11, projectRootDir: root });
    expect(b.aspect).toBe("1:1");
    expect(b.width).toBe(1080);
    expect(b.height).toBe(1080);
  });

  it("rejects unknown keys in --- meta --- section", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const metaPath = join(root, "meta.md");
    writeFileSync(
      metaPath,
      `--- meta ---
title: OK
badKey: x
---
`,
      "utf8",
    );
    expect(() =>
      parseMetaFile({ metaMdPath: metaPath, projectRootDir: root }),
    ).toThrow(/未知的 meta 键/);
  });
});

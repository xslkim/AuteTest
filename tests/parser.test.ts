import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlockFiles } from "../src/parser/blocks.js";
import { parseBlockDirectives } from "../src/parser/directives.js";
import { parseMetaFile } from "../src/parser/meta.js";
import { loadProjectFile } from "../src/parser/project.js";

function mkRoot(label: string): string {
  return join(
    tmpdir(),
    `autovideo-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function minimalBlock(title: string, id?: string): string {
  const idPart = id ? ` ${id}` : "";
  return `>>> ${title}${idPart}
--- visual ---
v
--- narration ---
n
`;
}

describe("parseBlockDirectives", () => {
  it("rejects @duration without s suffix", () => {
    expect(() =>
      parseBlockDirectives(["@duration: 8"], "/x.md", 1),
    ).toThrow(/仅接受/);
  });

  it("rejects compound @duration", () => {
    expect(() =>
      parseBlockDirectives(["@duration: 1m20s"], "/x.md", 1),
    ).toThrow(/仅接受/);
  });

  it("accepts @duration with decimal seconds", () => {
    const r = parseBlockDirectives(["@duration: 1.5s"], "/x.md", 1);
    expect(r.explicitDurationSec).toBe(1.5);
  });
});

describe("parseBlockFiles", () => {
  it("parses multiple blocks in one file in order", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(
      a,
      `${minimalBlock("First", "#B01")}${minimalBlock("Second", "#B02")}`,
      "utf8",
    );
    const blocks = parseBlockFiles([a]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBe("B01");
    expect(blocks[0]!.title).toBe("First");
    expect(blocks[1]!.id).toBe("B02");
    expect(blocks[1]!.title).toBe("Second");
  });

  it("merges blocks from multiple files in list order", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const first = join(root, "first.md");
    const second = join(root, "second.md");
    writeFileSync(first, minimalBlock("A", "#B01"), "utf8");
    writeFileSync(second, minimalBlock("B"), "utf8");

    const blocks = parseBlockFiles([first, second]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.title).toBe("A");
    expect(blocks[0]!.id).toBe("B01");
    expect(blocks[1]!.title).toBe("B");
    expect(blocks[1]!.id).toBe("B02");
  });

  it("auto-assigns B01 B02 when IDs omitted", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "one.md");
    writeFileSync(a, `${minimalBlock("X")}${minimalBlock("Y")}`, "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks.map((b) => b.id)).toEqual(["B01", "B02"]);
  });

  it("normalizes numeric block id padding", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(a, minimalBlock("T", "#B1"), "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks[0]!.id).toBe("B01");
  });

  it("throws on duplicate block IDs", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(
      a,
      `${minimalBlock("A", "#B01")}${minimalBlock("B", "#B01")}`,
      "utf8",
    );
    expect(() => parseBlockFiles([a])).toThrow(/块 ID 重复/);
  });

  it("throws on duplicate IDs across files", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    const b = join(root, "b.md");
    writeFileSync(a, minimalBlock("A", "#B01"), "utf8");
    writeFileSync(b, minimalBlock("B", "#B01"), "utf8");
    expect(() => parseBlockFiles([a, b])).toThrow(/块 ID 重复/);
  });

  it("defaults enter/exit to fade", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(a, minimalBlock("X"), "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks[0]!.enter).toBe("fade");
    expect(blocks[0]!.exit).toBe("fade");
  });

  it("parses @enter @exit @duration in block", () => {
    const root = mkRoot("blk");
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(
      a,
      `>>> T
@enter: fade-up
@exit: zoom-out
@duration: 8s
--- visual ---
v
--- narration ---
n
`,
      "utf8",
    );
    const blocks = parseBlockFiles([a]);
    expect(blocks[0]!.enter).toBe("fade-up");
    expect(blocks[0]!.exit).toBe("zoom-out");
    expect(blocks[0]!.explicitDurationSec).toBe(8);
  });
});

describe("loadProjectFile", () => {
  it("rejects missing meta field", () => {
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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
    const root = mkRoot("proj");
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

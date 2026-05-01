import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlockFiles } from "../src/parser/blocks.js";
import { parseBlockDirectives } from "../src/parser/directives.js";

function mkRoot(): string {
  return join(
    tmpdir(),
    `autovideo-t12-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    const root = mkRoot();
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
    const root = mkRoot();
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
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const a = join(root, "one.md");
    writeFileSync(a, `${minimalBlock("X")}${minimalBlock("Y")}`, "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks.map((b) => b.id)).toEqual(["B01", "B02"]);
  });

  it("normalizes numeric block id padding", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(a, minimalBlock("T", "#B1"), "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks[0]!.id).toBe("B01");
  });

  it("throws on duplicate block IDs", () => {
    const root = mkRoot();
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
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    const b = join(root, "b.md");
    writeFileSync(a, minimalBlock("A", "#B01"), "utf8");
    writeFileSync(b, minimalBlock("B", "#B01"), "utf8");
    expect(() => parseBlockFiles([a, b])).toThrow(/块 ID 重复/);
  });

  it("defaults enter/exit to fade", () => {
    const root = mkRoot();
    mkdirSync(root, { recursive: true });
    const a = join(root, "a.md");
    writeFileSync(a, minimalBlock("X"), "utf8");
    const blocks = parseBlockFiles([a]);
    expect(blocks[0]!.enter).toBe("fade");
    expect(blocks[0]!.exit).toBe("fade");
  });

  it("parses @enter @exit @duration in block", () => {
    const root = mkRoot();
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

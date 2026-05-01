import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processVisualAssets } from "../src/parser/assets.js";

function mkRoot(): string {
  return join(
    tmpdir(),
    `autovideo-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function md5_8(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex").slice(0, 8);
}

describe("processVisualAssets", () => {
  it("同名不同目录 → manifest 不同 key，各自复制", () => {
    const root = mkRoot();
    try {
      mkdirSync(join(root, "a"), { recursive: true });
      mkdirSync(join(root, "b"), { recursive: true });
      writeFileSync(join(root, "a", "pic.png"), "a");
      writeFileSync(join(root, "b", "pic.png"), "b");

      const buildOut = join(root, "build");
      const descA = "see ./a/pic.png";
      const descB = "see ./b/pic.png";
      const mdPath = join(root, "content.md");
      const { assets, descriptions } = processVisualAssets(
        [
          { visualDescription: descA, sourcePath: mdPath },
          { visualDescription: descB, sourcePath: mdPath },
        ],
        root,
        buildOut,
      );

      expect(Object.keys(assets)).toHaveLength(2);
      expect(assets["a/pic.png"]).toBeDefined();
      expect(assets["b/pic.png"]).toBeDefined();
      expect(assets["a/pic.png"]).not.toBe(assets["b/pic.png"]);
      expect(descriptions[0]).toContain(`assets/${md5_8(Buffer.from("a"))}.png`);
      expect(descriptions[1]).toContain(`assets/${md5_8(Buffer.from("b"))}.png`);

      expect(readFileSync(join(buildOut, "public", assets["a/pic.png"]!), "utf8")).toBe("a");
      expect(readFileSync(join(buildOut, "public", assets["b/pic.png"]!), "utf8")).toBe("b");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("同文件多块引用 → assets 去重（单 manifest 条目、单磁盘文件）", () => {
    const root = mkRoot();
    try {
      mkdirSync(join(root, "img"), { recursive: true });
      writeFileSync(join(root, "img", "x.png"), "same");

      const buildOut = join(root, "build");
      const md = join(root, "c.md");
      const d1 = "one ./img/x.png";
      const d2 = "two ./img/x.png";
      const { assets, descriptions } = processVisualAssets(
        [
          { visualDescription: d1, sourcePath: md },
          { visualDescription: d2, sourcePath: md },
        ],
        root,
        buildOut,
      );

      expect(Object.keys(assets)).toEqual(["img/x.png"]);
      const target = assets["img/x.png"]!;
      expect(descriptions[0]).toContain(target);
      expect(descriptions[1]).toContain(target);
      expect(readFileSync(join(buildOut, "public", target), "utf8")).toBe("same");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("代码引用无「第 X-Y 行」→ 仅 hash 复制与路径替换，不追加 fenced 块", () => {
    const root = mkRoot();
    try {
      const codeDir = join(root, "src");
      mkdirSync(codeDir, { recursive: true });
      const lines = Array.from({ length: 40 }, (_, i) => `L${i + 1}`);
      writeFileSync(join(codeDir, "microgpt.py"), lines.join("\n"));

      const buildOut = join(root, "build");
      const md = join(root, "block.md");
      const desc =
        `展示 Python，文件 ./src/microgpt.py（无行号范围）\n` +
        `一些说明文字`;

      const { descriptions } = processVisualAssets(
        [{ visualDescription: desc, sourcePath: md }],
        root,
        buildOut,
      );

      const out = descriptions[0]!;
      expect(out).not.toMatch(/```/);
      expect(out).toMatch(/assets\/[0-9a-f]{8}\.py/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("有「第 X-Y 行」→ 追加 fenced 代码块（上下文 ±5）", () => {
    const root = mkRoot();
    try {
      const codeDir = join(root, "src");
      mkdirSync(codeDir, { recursive: true });
      const lines = Array.from({ length: 50 }, (_, i) => `L${i + 1}`);
      writeFileSync(join(codeDir, "microgpt.py"), lines.join("\n"));

      const buildOut = join(root, "build");
      const md = join(root, "block.md");
      const desc =
        `展示 ./src/microgpt.py 第 30-32 行\n` +
        `重点是 Value 类`;

      const { descriptions } = processVisualAssets(
        [{ visualDescription: desc, sourcePath: md }],
        root,
        buildOut,
      );

      const out = descriptions[0]!;
      expect(out).toMatch(/```python\n/);
      expect(out).toContain("L25");
      expect(out).toContain("L37");
      expect(out).not.toContain("L1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

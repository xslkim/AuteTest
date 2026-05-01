import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import {
  expandUserPath,
  loadResolvedCliConfig,
  mergeAutovideoConfig,
  parseMetaPair,
} from "../src/config/load.js";

describe("parseMetaPair", () => {
  it("rejects dotted.key (nested notation)", () => {
    expect(() => parseMetaPair("nested.title=foo")).toThrow(/点号嵌套字段/);
    expect(() => parseMetaPair("dotted.key=val")).toThrow(/点号嵌套字段/);
  });

  it("parses title=foo as string inference", () => {
    expect(parseMetaPair("title=foo")).toEqual({
      key: "title",
      value: "foo",
    });
  });

  it("parses fps=30 as integer", () => {
    expect(parseMetaPair("fps=30")).toEqual({
      key: "fps",
      value: 30,
    });
  });
});

describe("config merge precedence", () => {
  let root: string;
  let extraFile: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `autovideo-t0-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    extraFile = join(root, "extra-autovideo.config.json");
    writeFileSync(
      join(root, "autovideo.config.json"),
      JSON.stringify({
        anthropic: { model: "from-root" },
      }),
      "utf8",
    );
    writeFileSync(
      extraFile,
      JSON.stringify({
        anthropic: { model: "from-extra", maxRetries: 9 },
      }),
      "utf8",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CLI --cache-dir wins over merged file.cache.dir", () => {
    const { config } = loadResolvedCliConfig({
      cwd: root,
      argv: [
        "node",
        "autovideo",
        "compile",
        "p.json",
        "--cache-dir",
        join(root, "cli-cache"),
      ],
    });
    expect(config.resolvedCacheDir).toBe(join(root, "cli-cache"));
  });

  it("merge order: defaults < root json < --config", () => {
    const { config } = loadResolvedCliConfig({
      cwd: root,
      argv: ["node", "autovideo", "tts", "s.json", "--config", extraFile],
    });

    expect(config.anthropic.model).toBe("from-extra");
    expect(config.anthropic.maxRetries).toBe(9);
    expect(config.voxcpm.endpoint).toBe(DEFAULT_AUTOVIDEO_CONFIG.voxcpm.endpoint);
  });
});

describe("expandUserPath", () => {
  it("maps ~ segment to homedir (posix style)", () => {
    expect(expandUserPath("~/Videos/cache", "/tmp/proj")).toBe(
      join(homedir(), "Videos", "cache"),
    );
  });
});

describe("mergeAutovideoConfig deep merge loudnorm + scalar override", () => {
  it("nested loudnorm merges; unknown top-level keys ignored", () => {
    const base = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {});
    const next = mergeAutovideoConfig(base, {
      render: { minHoldSec: 99, loudnorm: { i: -20 } },
      unknownSection: { foo: 1 },
    } as never);
    expect(next.render.minHoldSec).toBe(99);
    expect(next.render.loudnorm.i).toBe(-20);
    expect(next.render.loudnorm.tp).toBe(
      DEFAULT_AUTOVIDEO_CONFIG.render.loudnorm.tp,
    );
    expect("unknownSection" in next).toBe(false);
  });
});

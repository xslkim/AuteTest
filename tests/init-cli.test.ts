import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCompileCommand } from "../src/cli/compile.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import { mergeAutovideoConfig } from "../src/config/load.js";
import { runInitCommand } from "../src/cli/init.js";

describe("runInitCommand", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "av-init-cli-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function minimalWav(): Buffer {
    const r = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=mono",
        "-t",
        "1",
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        "-",
      ],
      { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 },
    );
    expect(r.status, r.stderr?.toString()).toBe(0);
    return r.stdout as Buffer;
  }

  it("复制 starter 到目标目录并保持关键文件", () => {
    const demo = path.join(root, "demo");
    runInitCommand({ argv: ["node", "autovideo", "init", demo], cwd: root });

    expect(existsSync(path.join(demo, "project.json"))).toBe(true);
    expect(existsSync(path.join(demo, "meta.md"))).toBe(true);
    expect(existsSync(path.join(demo, "script.md"))).toBe(true);
    expect(existsSync(path.join(demo, "README.md"))).toBe(true);
    expect(existsSync(path.join(demo, "autovideo.config.json"))).toBe(true);
    expect(existsSync(path.join(demo, "hero.png"))).toBe(true);

    const readme = readFileSync(path.join(demo, "README.md"), "utf8");
    expect(readme).toContain("B00.wav");
    expect(readme).toContain("ANTHROPIC_API_KEY");
    expect(readme).toContain("autovideo doctor");
    expect(readme).toContain("autovideo build project.json");

    const script = readFileSync(path.join(demo, "script.md"), "utf8");
    expect(script).toContain("--- visual ---");
    expect(script).toContain("./hero.png");
  });

  it("nested 路径：自动创建父目录", () => {
    const demo = path.join(root, "nested", "demo");
    runInitCommand({ argv: ["node", "autovideo", "init", demo], cwd: root });
    expect(existsSync(path.join(demo, "project.json"))).toBe(true);
  });

  it("非 force 时目录已含模板文件则抛错", () => {
    const demo = path.join(root, "demo");
    mkdirSync(demo, { recursive: true });
    writeFileSync(path.join(demo, "project.json"), "{}\n");

    expect(() =>
      runInitCommand({ argv: ["node", "autovideo", "init", demo], cwd: root }),
    ).toThrow(/--force/);
  });

  it("init 后 compile 通过（需 B00.wav）", async () => {
    const demo = path.join(root, "demo-init-compile");
    runInitCommand({ argv: ["node", "autovideo", "init", demo], cwd: root });
    writeFileSync(path.join(demo, "B00.wav"), minimalWav());

    const cacheDir = path.join(root, "cache");
    mkdirSync(cacheDir, { recursive: true });
    const merged = mergeAutovideoConfig(DEFAULT_AUTOVIDEO_CONFIG, {
      cache: { dir: cacheDir },
    });

    const cfgPath = path.join(root, "init-test.config.json");
    writeFileSync(cfgPath, JSON.stringify(merged, null, 2));

    const buildOut = path.join(demo, "build-out");
    await runCompileCommand({
      argv: [
        "node",
        "autovideo",
        "compile",
        "project.json",
        "--config",
        cfgPath,
        "--out",
        buildOut,
      ],
      cwd: demo,
    });
    expect(existsSync(path.join(buildOut, "script.json"))).toBe(true);
  });
});

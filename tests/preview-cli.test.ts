import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: (...args: unknown[]) => spawnMock(...args),
  };
});

import { runPreviewCommand } from "../src/cli/preview.js";
import { DEFAULT_CACHE, DEFAULT_RENDER, DEFAULT_VOXCPM } from "../src/config/defaults.js";

describe("runPreviewCommand", () => {
  const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");

  let root: string;

  beforeEach(() => {
    spawnMock.mockReset();
    process.env.AUTVIDEO_PREVIEW_OPEN = "0";

    const fakeChild = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "exit") {
          queueMicrotask(() => cb(0, null));
        }
        return fakeChild;
      }),
    };
    spawnMock.mockReturnValue(fakeChild as never);

    root = mkdtempSync(path.join(tmpdir(), "av-preview-cli-"));
    const cfg = {
      voxcpm: DEFAULT_VOXCPM,
      anthropic: {
        apiKeyEnv: "ANTHROPIC_API_KEY",
        model: "claude-sonnet-4-6",
        promptCaching: true,
        maxRetries: 3,
        concurrency: 4,
      },
      render: DEFAULT_RENDER,
      cache: { ...DEFAULT_CACHE, dir: path.join(root, "cache"), evictTrigger: "manual" as const },
    };
    writeFileSync(path.join(root, "autovideo.config.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  });

  afterEach(() => {
    delete process.env.AUTVIDEO_PREVIEW_OPEN;
    rmSync(root, { recursive: true, force: true });
  });

  it("writes preview root + block imports + public/script.json and spawns Remotion", async () => {
    const scriptDir = path.join(root, "build", "proj");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = path.join(scriptDir, "script.json");
    const fixture = readFileSync(path.join(repoRoot, "tests/fixtures/minimal-script.json"), "utf8");
    writeFileSync(scriptPath, fixture);

    const argv = ["node", "autovideo", "preview", path.relative(root, scriptPath)];
    await runPreviewCommand({ argv, cwd: root });

    expect(readFileSync(path.join(scriptDir, "remotion-root-preview.tsx"), "utf8")).toContain(
      'id={block.id}',
    );
    expect(readFileSync(path.join(scriptDir, "src/remotion-block-imports.ts"), "utf8")).toContain(
      '"B01"',
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [execPath, args, spawnOpts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv },
    ];
    expect(execPath).toBe(process.execPath);
    expect(args[0]).toContain("remotion-cli.js");
    expect(args.slice(1)).toEqual([
      "studio",
      path.join(scriptDir, "remotion-root-preview.tsx"),
      "--no-open",
    ]);
    expect(spawnOpts.cwd).toBe(scriptDir);
    expect(spawnOpts.env?.AUTVIDEO_REMOTION_ENTRY).toBe("remotion-root-preview.tsx");
  });

  it("uses default port 3333 when --block is set without --port", async () => {
    const scriptDir = path.join(root, "build", "p-block");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = path.join(scriptDir, "script.json");
    writeFileSync(
      scriptPath,
      readFileSync(path.join(repoRoot, "tests/fixtures/minimal-script.json"), "utf8"),
    );

    const argv = [
      "node",
      "autovideo",
      "preview",
      path.relative(root, scriptPath),
      "--block",
      "B01",
    ];
    await runPreviewCommand({ argv, cwd: root });

    const [, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(args).toContain("--port=3333");
  });

  it("passes --port to Remotion when requested", async () => {
    const scriptDir = path.join(root, "build", "p2");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = path.join(scriptDir, "script.json");
    writeFileSync(
      scriptPath,
      readFileSync(path.join(repoRoot, "tests/fixtures/minimal-script.json"), "utf8"),
    );

    const argv = [
      "node",
      "autovideo",
      "preview",
      path.relative(root, scriptPath),
      "--port",
      "8765",
    ];
    await runPreviewCommand({ argv, cwd: root });

    const [, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(args).toContain("--port=8765");
  });

  it("rejects unknown --block id", async () => {
    const scriptDir = path.join(root, "build", "p3");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = path.join(scriptDir, "script.json");
    writeFileSync(
      scriptPath,
      readFileSync(path.join(repoRoot, "tests/fixtures/minimal-script.json"), "utf8"),
    );

    await expect(
      runPreviewCommand({
        argv: ["node", "av", "preview", path.relative(root, scriptPath), "--block", "B99"],
        cwd: root,
      }),
    ).rejects.toThrow(/没有匹配的块/);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

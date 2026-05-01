import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorExitCode,
  type DoctorCheckRow,
  runDoctorChecks,
} from "../src/cli/doctor.js";

describe("doctorExitCode", () => {
  it("returns 0 when all PASS", () => {
    const rows: DoctorCheckRow[] = [
      { name: "a", status: "PASS", detail: "", fix: "" },
      { name: "b", status: "PASS", detail: "", fix: "" },
    ];
    expect(doctorExitCode(rows)).toBe(0);
  });

  it("returns 1 when WARN and no FAIL", () => {
    const rows: DoctorCheckRow[] = [
      { name: "a", status: "PASS", detail: "", fix: "" },
      { name: "b", status: "WARN", detail: "", fix: "" },
    ];
    expect(doctorExitCode(rows)).toBe(1);
  });

  it("returns 2 when any FAIL (even with WARN)", () => {
    const rows: DoctorCheckRow[] = [
      { name: "a", status: "WARN", detail: "", fix: "" },
      { name: "b", status: "FAIL", detail: "", fix: "" },
    ];
    expect(doctorExitCode(rows)).toBe(2);
  });
});

describe("runDoctorChecks", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it("runs 11 checks with injectable network/browser stubs", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-for-doctor-unit";

    const base = mkdtempSync(join(tmpdir(), "autovideo-doctor-"));
    const cacheDir = join(base, "cache");
    mkdirSync(cacheDir, { recursive: true });
    const modelDir = join(base, "voxcpm-model");
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, "config.json"), "{}\n", "utf8");

    const cfgPath = join(base, "autovideo.config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        voxcpm: { modelDir },
        cache: { dir: cacheDir },
      }),
      "utf8",
    );

    const argv = [
      "node",
      "autovideo",
      "doctor",
      "--config",
      cfgPath,
      "--cache-dir",
      cacheDir,
    ] as const;

    const rows = await runDoctorChecks(
      { argv, cwd: base },
      {
        checkChromium: async () => ({
          name: "Chromium（Remotion）",
          status: "PASS",
          detail: "(stub)",
          fix: "—",
        }),
        checkVoxcpmHealth: async () => ({
          name: "VoxCPM2 服务",
          status: "PASS",
          detail: "(stub)",
          fix: "—",
        }),
        checkAnthropicPing: async () => ({
          name: "Claude API 连通",
          status: "PASS",
          detail: "(stub)",
          fix: "—",
        }),
      },
    );

    expect(rows).toHaveLength(11);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([
      "Node 版本",
      "ffmpeg",
      "Chromium（Remotion）",
      "CJK 字体模块",
      "VoxCPM2 服务",
      "VoxCPM2 模型权重",
      "Claude API key",
      "Claude API 连通",
      "缓存目录可写",
      "磁盘空间",
      "prlimit / unshare",
    ]);
    const nodeRow = rows.find((r) => r.name === "Node 版本");
    expect(nodeRow).toBeDefined();
    const rest = rows.filter((r) => r.name !== "Node 版本");
    expect(rest.every((r) => r.status === "PASS")).toBe(true);
    /* CI 镜像可能仍为 Node 18；doctor 对 <20 如实 FAIL */
    expect(["PASS", "FAIL"]).toContain(nodeRow!.status);
  });
});

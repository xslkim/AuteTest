import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildIsolatedEnv, runIsolated } from "../src/ai/sandbox.js";

describe("buildIsolatedEnv", () => {
  it("does not include non-whitelisted keys even when passed in overrides", () => {
    const env = buildIsolatedEnv({
      ANTHROPIC_API_KEY: "sk-secret",
      PATH: "/usr/bin",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("runIsolated", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "should-not-leak";
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it("child process does not see ANTHROPIC_API_KEY from parent", async () => {
    const r = await runIsolated("printenv", ["ANTHROPIC_API_KEY"], {
      timeoutMs: 5_000,
    });
    expect(r.stdout.trim()).toBe("");
    expect(r.exitCode).not.toBe(0);
  });

  it("terminates a long-running child after timeout (SIGTERM then exit)", async () => {
    const r = await runIsolated("sleep", ["60"], {
      timeoutMs: 800,
      cpuLimitSec: 120,
    });
    expect([128 + 15, 128 + 9, 143, 137]).toContain(r.exitCode);
  });

  it("unshare -n blocks outbound curl", async (ctx) => {
    const curlCheck = await runIsolated("which", ["curl"], {
      timeoutMs: 3_000,
    });
    if (curlCheck.exitCode !== 0) {
      ctx.skip();
    }

    const r = await runIsolated("curl", ["-sS", "--max-time", "3", "http://example.com"], {
      isolateNetwork: true,
      timeoutMs: 10_000,
    });
    expect(r.exitCode).not.toBe(0);
  });
});

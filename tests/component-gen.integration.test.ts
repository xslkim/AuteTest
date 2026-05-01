import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { generateComponentTsx } from "../src/ai/component-gen.js";
import { DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import type { ResolvedAutovideoConfig } from "../src/config/types.js";

const runLive = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!runLive)("generateComponentTsx (integration)", () => {
  it("returns non-empty tsx from Claude", async () => {
    const { readFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const systemPrompt = await readFile(
      join(here, "..", "src", "ai", "prompts", "component.md"),
      "utf8",
    );

    const config: ResolvedAutovideoConfig = {
      ...DEFAULT_AUTOVIDEO_CONFIG,
      resolvedCacheDir: "/tmp/autovideo-cache-test",
    };

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: config.anthropic.maxRetries,
    });

    const out = await generateComponentTsx({
      config,
      systemPrompt,
      userMessage:
        "Generate a minimal full-screen component: centered text \"Hello\". Use only react and remotion.",
      client,
    });

    expect(out.tsx.length).toBeGreaterThan(20);
    expect(out.tsx.toLowerCase()).toMatch(/export default|function/);
  }, 120_000);
});

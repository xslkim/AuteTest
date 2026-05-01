import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { generateComponentTsx } from "../src/ai/component-gen.js";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_ANTHROPIC, DEFAULT_AUTOVIDEO_CONFIG } from "../src/config/defaults.js";
import type { ResolvedAutovideoConfig } from "../src/config/types.js";

function resolvedConfig(anthropicPatch?: Partial<typeof DEFAULT_ANTHROPIC>): ResolvedAutovideoConfig {
  return {
    ...DEFAULT_AUTOVIDEO_CONFIG,
    anthropic: { ...DEFAULT_ANTHROPIC, ...anthropicPatch },
    resolvedCacheDir: "/tmp/cache",
  };
}

describe("generateComponentTsx", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });
  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
    vi.restoreAllMocks();
  });

  it("sends ephemeral cache_control on system + tool, and render_component schema + tool_choice", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "msg_1",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "tool_use",
      stop_sequence: null,
      type: "message",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "render_component",
          input: { tsx: 'export default function X() { return null; }' },
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 0,
      },
    });

    const client = {
      beta: { messages: { create } },
    } as unknown as Anthropic;

    const out = await generateComponentTsx({
      config: resolvedConfig(),
      systemPrompt: "SYS",
      userMessage: "USER",
      client,
    });

    expect(out.tsx).toContain("export default");
    expect(out.cacheHit).toBe(false);
    expect(out.usage.cache_read_input_tokens).toBe(0);

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0] as Record<string, unknown>;

    expect(body.betas).toEqual(["prompt-caching-2024-07-31"]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "render_component" });
    expect(body.model).toBe("claude-sonnet-4-6");

    const system = body.system as Array<Record<string, unknown>>;
    expect(Array.isArray(system)).toBe(true);
    expect(system[0]).toMatchObject({
      type: "text",
      text: "SYS",
      cache_control: { type: "ephemeral" },
    });

    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("render_component");
    expect(tools[0]!.input_schema).toEqual({
      type: "object",
      properties: {
        tsx: { type: "string", description: "Full React component source (.tsx)" },
      },
      required: ["tsx"],
    });
    expect(tools[0]!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("sets cacheHit when cache_read_input_tokens > 0", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "msg_2",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "tool_use",
      stop_sequence: null,
      type: "message",
      content: [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "render_component",
          input: { tsx: "// ok" },
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 42,
      },
    });

    const client = {
      beta: { messages: { create } },
    } as unknown as Anthropic;

    const out = await generateComponentTsx({
      config: resolvedConfig(),
      systemPrompt: "S",
      userMessage: "U",
      client,
    });
    expect(out.cacheHit).toBe(true);
  });

  it("throws when API key env is empty", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      generateComponentTsx({
        config: resolvedConfig({ apiKeyEnv: "ANTHROPIC_API_KEY" }),
        systemPrompt: "S",
        userMessage: "U",
        client: { beta: { messages: { create: vi.fn() } } } as unknown as Anthropic,
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

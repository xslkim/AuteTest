import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedAutovideoConfig } from "../config/types.js";

/** 与 PRD / TASKS T4.2：`render_component` 工具，输入含生成的 TSX。 */
const RENDER_COMPONENT_TOOL = {
  name: "render_component",
  input_schema: {
    type: "object" as const,
    properties: {
      tsx: { type: "string" as const, description: "Full React component source (.tsx)" },
    },
    required: ["tsx"],
  },
};

export interface ComponentGenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

export interface ComponentGenResult {
  tsx: string;
  usage: ComponentGenUsage;
  /** `usage.cache_read_input_tokens > 0`（按 TASKS T4.2） */
  cacheHit: boolean;
}

export interface GenerateComponentTsxOptions {
  config: ResolvedAutovideoConfig;
  /** 已展开的文本（通常为 `component.md` + 主题等）；会标 `cache_control: ephemeral`。 */
  systemPrompt: string;
  userMessage: string;
  /** 测试注入；默认 `new Anthropic({ apiKey, maxRetries })` */
  client?: Anthropic;
  signal?: AbortSignal;
}

/**
 * 调用 Claude Messages API（beta + prompt cache），强制 `render_component` 工具返回 TSX。
 */
export async function generateComponentTsx(
  opts: GenerateComponentTsxOptions,
): Promise<ComponentGenResult> {
  const { config, systemPrompt, userMessage, client, signal } = opts;
  const a = config.anthropic;
  const apiKey = process.env[a.apiKeyEnv];
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      `Missing Claude API key: set non-empty environment variable ${JSON.stringify(a.apiKeyEnv)}`,
    );
  }

  const anthropic =
    client ??
    new Anthropic({
      apiKey,
      maxRetries: a.maxRetries,
    });

  const usePromptCache = a.promptCaching;
  const betas = usePromptCache
    ? (["prompt-caching-2024-07-31"] as Anthropic.AnthropicBeta[])
    : undefined;

  const system = usePromptCache
    ? [
        {
          type: "text" as const,
          text: systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : systemPrompt;

  const tools = usePromptCache
    ? [{ ...RENDER_COMPONENT_TOOL, cache_control: { type: "ephemeral" as const } }]
    : [RENDER_COMPONENT_TOOL];

  const response = await anthropic.beta.messages.create(
    {
      betas,
      model: a.model,
      max_tokens: 16_384,
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      tool_choice: { type: "tool", name: "render_component" },
    },
    { signal },
  );

  const toolBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === RENDER_COMPONENT_TOOL.name,
  );
  if (
    !toolBlock ||
    toolBlock.type !== "tool_use" ||
    toolBlock.name !== RENDER_COMPONENT_TOOL.name
  ) {
    throw new Error(
      `Expected tool_use "${RENDER_COMPONENT_TOOL.name}", got stop_reason=${String(response.stop_reason)}`,
    );
  }

  const raw = toolBlock.input as { tsx?: unknown };
  const tsx = typeof raw.tsx === "string" ? raw.tsx : "";
  if (tsx === "") {
    throw new Error(`Tool ${RENDER_COMPONENT_TOOL.name} returned empty or missing tsx`);
  }

  const u = response.usage;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return {
    tsx,
    usage: {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens,
    },
    cacheHit: cacheRead > 0,
  };
}

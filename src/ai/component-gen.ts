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

  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const anthropic =
    client ??
    new Anthropic({
      apiKey,
      maxRetries: a.maxRetries,
      ...(baseURL ? { baseURL } : {}),
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

  // ANTHROPIC_MODEL 环境变量（由 cc-switch 注入）可覆盖配置文件中的模型名
  const modelName = process.env.ANTHROPIC_MODEL || a.model;

  // 仅 Claude 原生模型支持强制 tool_choice；DeepSeek 等第三方模型不支持，
  // 靠系统提示引导 + fallback 文本解析来提取 TSX。
  const isClaudeNative = modelName.startsWith("claude");
  const commonParams = {
    model: modelName,
    max_tokens: 16_384,
    system,
    messages: [{ role: "user" as const, content: userMessage }],
    tools,
    ...(isClaudeNative ? { tool_choice: { type: "tool" as const, name: "render_component" } } : {}),
  };

  // 使用 beta 端点仅当 prompt caching 开启，否则走标准端点
  // 自定义 API 代理（如 claude-code.club）可能不支持 beta 路径
  const response = usePromptCache
    ? await anthropic.beta.messages.create({ betas, ...commonParams }, { signal })
    : await anthropic.messages.create(commonParams, { signal });

  const toolBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === RENDER_COMPONENT_TOOL.name,
  );

  let tsx = "";

  if (toolBlock && toolBlock.type === "tool_use" && toolBlock.name === RENDER_COMPONENT_TOOL.name) {
    const raw = toolBlock.input as { tsx?: unknown };
    tsx = typeof raw.tsx === "string" ? raw.tsx : "";
  }

  // 无论是否有 tool_use block，只要 tsx 还空，就尝试从文本中提取。
  // DeepSeek 等模型有时会同时返回 text block 和空 tool_use block，
  // 或不走 tool_use 直接以文本输出，或代理忽略 tool_choice 返回文本。
  if (!tsx) {
    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      const text = textBlock.text;
      // 1. JSON 代码块：```json\n{"tsx":"..."}\n```
      const jsonMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]!) as { tsx?: unknown };
          if (typeof parsed.tsx === "string" && parsed.tsx.length > 0) {
            tsx = parsed.tsx;
          }
        } catch {
          // ignore
        }
      }
      // 2. 整个文本直接就是 JSON
      if (!tsx) {
        try {
          const parsed = JSON.parse(text.trim()) as { tsx?: unknown };
          if (typeof parsed.tsx === "string" && parsed.tsx.length > 0) {
            tsx = parsed.tsx;
          }
        } catch {
          // ignore
        }
      }
      // 3. TSX 代码块：```tsx\n...\n``` 或 ```typescript\n...\n```
      if (!tsx) {
        const tsxMatch = text.match(/```(?:tsx?|typescript)\s*\n([\s\S]*?)\n```/);
        if (tsxMatch && tsxMatch[1]!.trim().length > 0) {
          tsx = tsxMatch[1]!.trim();
        }
      }
    }
  }

  if (!tsx) {
    const hasToolBlock = !!(toolBlock && toolBlock.type === "tool_use");
    throw new Error(
      hasToolBlock
        ? `Tool ${RENDER_COMPONENT_TOOL.name} returned empty or missing tsx`
        : `Expected tool_use "${RENDER_COMPONENT_TOOL.name}", got stop_reason=${String(response.stop_reason)}`,
    );
  }

  const u = response.usage;
  // cache_read_input_tokens / cache_creation_input_tokens 仅在 beta 路径响应中存在
  const uAny = u as unknown as Record<string, unknown>;
  const cacheReadTokens = uAny["cache_read_input_tokens"] as number | null | undefined;
  const cacheCreationTokens = uAny["cache_creation_input_tokens"] as number | null | undefined;
  const cacheRead = cacheReadTokens ?? 0;
  return {
    tsx,
    usage: {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_creation_input_tokens: cacheCreationTokens ?? null,
      cache_read_input_tokens: cacheReadTokens ?? null,
    },
    cacheHit: cacheRead > 0,
  };
}

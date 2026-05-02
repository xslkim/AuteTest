/**
 * cc-switch / Claude CLI 环境自动注入
 *
 * Claude CLI 把当前激活 provider 的凭据存在 ~/.claude/settings.json 的 env 字段。
 * 本模块在进程启动时读取该文件，将其中的 env 变量注入 process.env（不覆盖已存在的值），
 * 使 autovideo 无需单独配置 API key，直接与 cc-switch 保持同步。
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface ClaudeSettings {
  env?: Record<string, string>;
  [k: string]: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 读取 ~/.claude/settings.json，将其 env 字段中未被当前进程设置的变量注入 process.env。
 * 返回实际注入的 key 列表（仅供日志参考）。
 */
export function injectCcSwitchEnv(): string[] {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return [];
  }

  let settings: ClaudeSettings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8")) as ClaudeSettings;
  } catch {
    return [];
  }

  if (!isPlainObject(settings.env)) {
    return [];
  }

  const injected: string[] = [];
  for (const [key, value] of Object.entries(settings.env)) {
    if (typeof value !== "string") continue;
    // cc-switch 为权威来源，强制覆盖（包括从父进程继承的旧值）
    process.env[key] = value;
    injected.push(key);
  }
  return injected;
}

import { ANIMATION_PRESETS, type AnimationPreset } from "../types/script.js";

const PRESET_SET = new Set<string>(ANIMATION_PRESETS);

/** `@duration` 仅允许 `<数字>s`，如 `8s`、`1.5s`（PRD §3.5） */
const DURATION_SEC_RE = /^(\d+)(\.\d+)?s$/i;

function parseAtDirectiveLine(line: string): { kind: "enter" | "exit" | "duration"; value: string } | null {
  const t = line.trim();
  const m = t.match(/^@(enter|exit|duration)\s*:\s*(.*)$/i);
  if (!m) return null;
  return { kind: m[1]!.toLowerCase() as "enter" | "exit" | "duration", value: m[2]!.trim() };
}

export interface ParsedDirectives {
  enter: AnimationPreset;
  exit: AnimationPreset;
  explicitDurationSec?: number;
}

const DEFAULT_ENTER: AnimationPreset = "fade";
const DEFAULT_EXIT: AnimationPreset = "fade";

/**
 * 从块内 directive 区（`--- visual ---` 之前）解析 `@enter` / `@exit` / `@duration`。
 * 未知 `@xxx:` 行报错。同一指令重复定义报错。
 */
export function parseBlockDirectives(
  directiveLines: string[],
  filePath: string,
  startLineNo: number,
): ParsedDirectives {
  let enter: AnimationPreset | undefined;
  let exit: AnimationPreset | undefined;
  let explicitDurationSec: number | undefined;

  for (let i = 0; i < directiveLines.length; i++) {
    const line = directiveLines[i] ?? "";
    const lineNo = startLineNo + i;
    const raw = line.trim();
    if (!raw) continue;

    const parsed = parseAtDirectiveLine(line);
    if (!parsed) {
      if (raw.startsWith("@")) {
        throw new Error(
          `${filePath}:${lineNo}: 未知的块指令 ${JSON.stringify(raw.split(":")[0] ?? raw)}，仅支持 @enter / @exit / @duration`,
        );
      }
      throw new Error(
        `${filePath}:${lineNo}: 块内在 --- visual --- 之前出现非指令行: ${JSON.stringify(raw.slice(0, 80))}`,
      );
    }

    if (parsed.kind === "enter") {
      if (enter !== undefined) {
        throw new Error(`${filePath}:${lineNo}: @enter 重复定义`);
      }
      const v = parsed.value;
      if (!PRESET_SET.has(v)) {
        throw new Error(
          `${filePath}:${lineNo}: @enter 值无效 ${JSON.stringify(v)}（允许: ${ANIMATION_PRESETS.join(", ")}）`,
        );
      }
      enter = v as AnimationPreset;
    } else if (parsed.kind === "exit") {
      if (exit !== undefined) {
        throw new Error(`${filePath}:${lineNo}: @exit 重复定义`);
      }
      const v = parsed.value;
      if (!PRESET_SET.has(v)) {
        throw new Error(
          `${filePath}:${lineNo}: @exit 值无效 ${JSON.stringify(v)}（允许: ${ANIMATION_PRESETS.join(", ")}）`,
        );
      }
      exit = v as AnimationPreset;
    } else {
      if (explicitDurationSec !== undefined) {
        throw new Error(`${filePath}:${lineNo}: @duration 重复定义`);
      }
      const durRaw = parsed.value.trim();
      const dm = durRaw.match(DURATION_SEC_RE);
      if (!dm) {
        throw new Error(
          `${filePath}:${lineNo}: @duration 仅接受 "<数字>s" 格式（如 8s、1.5s），收到 ${JSON.stringify(durRaw)}`,
        );
      }
      explicitDurationSec = Number.parseFloat(durRaw.slice(0, -1));
      if (!Number.isFinite(explicitDurationSec) || explicitDurationSec < 0) {
        throw new Error(
          `${filePath}:${lineNo}: @duration 数值无效 ${JSON.stringify(durRaw)}`,
        );
      }
    }
  }

  return {
    enter: enter ?? DEFAULT_ENTER,
    exit: exit ?? DEFAULT_EXIT,
    ...(explicitDurationSec !== undefined ? { explicitDurationSec } : {}),
  };
}

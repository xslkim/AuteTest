import type { NarrationLine } from "../types/script.js";

/**
 * PRD §3.7：`\*` → 字面 `*`（故 `\*\*` → `**`，不参与加粗配对扫描之外的语义）
 */
function unescapeAsteriskEscapes(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && s[i + 1] === "*") {
      out += "*";
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * PRD §3.7：拆行（忽略空行）→ `NarrationLine[]`
 *
 * - `text`：`\*` 转义消解后的原文（仍含真正的 `**` 标记）
 * - `ttsText`：剥离配对 `**...**` 标记后的纯文本
 * - `highlights`：`ttsText` 上的 UTF-16 code unit offset（与 JS string index 一致）
 */
export function parseNarrationLines(narrationRaw: string): NarrationLine[] {
  const lines = narrationRaw.split(/\r?\n/);
  const out: NarrationLine[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(parseNarrationLine(trimmed));
  }
  return out;
}

export function parseNarrationLine(rawLine: string): NarrationLine {
  const text = unescapeAsteriskEscapes(rawLine);
  const working = text;

  type Seg = { kind: "lit"; s: string } | { kind: "bold"; s: string };
  const segs: Seg[] = [];

  let pos = 0;
  while (pos < working.length) {
    const open = working.indexOf("**", pos);
    if (open === -1) {
      segs.push({ kind: "lit", s: working.slice(pos) });
      break;
    }
    if (open > pos) {
      segs.push({ kind: "lit", s: working.slice(pos, open) });
    }
    const close = working.indexOf("**", open + 2);
    if (close === -1) {
      segs.push({ kind: "lit", s: working.slice(open) });
      break;
    }
    segs.push({ kind: "bold", s: working.slice(open + 2, close) });
    pos = close + 2;
  }

  let ttsText = "";
  const highlights: { start: number; end: number }[] = [];

  for (const seg of segs) {
    const piece = seg.s;
    if (seg.kind === "lit") {
      ttsText += piece;
    } else {
      const start = ttsText.length;
      ttsText += piece;
      const end = ttsText.length;
      if (end > start) {
        highlights.push({ start, end });
      }
    }
  }

  return { text, ttsText, highlights };
}

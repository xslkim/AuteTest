import type { JSX, ReactNode } from "react";
import type {
  NarrationLine,
  SubtitleOverlayProps,
} from "../../src/types/script.js";

/** 供单测与 SubtitleOverlay 共用：按块音频时间轴解析当前字幕行。 */
export function findActiveLineIndex(
  audioMs: number,
  lineTimings: { lineIndex: number; startMs: number; endMs: number }[],
): number | null {
  const sorted = [...lineTimings].sort((a, b) => a.startMs - b.startMs);
  for (const t of sorted) {
    if (audioMs >= t.startMs && audioMs <= t.endMs) {
      return t.lineIndex;
    }
  }
  return null;
}

function clampHighlight(
  h: { start: number; end: number },
  len: number,
): { start: number; end: number } | null {
  const start = Math.max(0, Math.min(h.start, len));
  const end = Math.max(0, Math.min(h.end, len));
  if (end <= start) {
    return null;
  }
  return { start, end };
}

/** 将 ttsText + highlights 切成普通 / 高亮片段（高亮段左闭右开 [start,end) 在 ttsText 上）。 */
export function splitTtsTextWithHighlights(
  ttsText: string,
  highlights: { start: number; end: number }[],
): { text: string; highlight: boolean }[] {
  const len = ttsText.length;
  const ranges = highlights
    .map((h) => clampHighlight(h, len))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) {
      merged.push({ ...r });
    } else {
      last.end = Math.max(last.end, r.end);
    }
  }

  const out: { text: string; highlight: boolean }[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      out.push({ text: ttsText.slice(cursor, r.start), highlight: false });
    }
    out.push({ text: ttsText.slice(r.start, r.end), highlight: true });
    cursor = r.end;
  }
  if (cursor < len) {
    out.push({ text: ttsText.slice(cursor), highlight: false });
  }
  return out;
}

function renderLine(
  line: NarrationLine,
  accentColor: string,
  fgColor: string,
): ReactNode {
  const parts = splitTtsTextWithHighlights(line.ttsText, line.highlights);
  return parts.map((p, i) =>
    p.highlight ? (
      <span key={i} style={{ color: accentColor }}>
        {p.text}
      </span>
    ) : (
      <span key={i} style={{ color: fgColor }}>
        {p.text}
      </span>
    ),
  );
}

/**
 * 块内字幕层：与 PRD §6.4 一致，在 `audioStartFrame` 之前不显示；时间轴与块音频对齐。
 */
export function SubtitleOverlay({
  lines,
  lineTimings,
  audioStartFrame,
  frame,
  fps,
  width,
  height,
  theme,
}: SubtitleOverlayProps): JSX.Element | null {
  const audioFrame = frame - audioStartFrame;
  if (audioFrame < 0) {
    return null;
  }

  const audioMs = (audioFrame / fps) * 1000;
  const lineIndex = findActiveLineIndex(audioMs, lineTimings);
  if (lineIndex === null || lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }

  const line = lines[lineIndex]!;
  const sub = theme.subtitle;
  const fontSize = height * (sub.fontSizePct / 100);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: `${sub.maxWidthPct}%`,
        maxWidth: "100%",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: sub.backgroundColor,
          padding: sub.paddingPx,
          fontFamily: sub.fontFamily,
          fontSize,
          lineHeight: sub.lineHeight,
          color: theme.colors.fg,
          borderRadius: 4,
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        {renderLine(line, theme.colors.accent, theme.colors.fg)}
      </div>
    </div>
  );
}

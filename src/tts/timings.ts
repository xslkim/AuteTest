/**
 * PRD §6.2.3 step 4 — `lineTimings` from per-line speech duration (seconds, e.g. ffprobe)
 * after each line is concatenated with a fixed 200 ms tail silence in the block WAV.
 */

export const LINE_TAIL_SILENCE_MS = 200;

export interface LineTimingEntry {
  lineIndex: number;
  startMs: number;
  endMs: number;
}

function assertNonNegativeFiniteSec(name: string, sec: number): void {
  if (!Number.isFinite(sec)) {
    throw new Error(`${name}: expected finite number, got ${String(sec)}`);
  }
  if (sec < 0) {
    throw new Error(`${name}: expected non-negative duration, got ${sec}`);
  }
}

/**
 * @param lineSpeechDurationsSec — duration of each line’s TTS speech only (no tail silence)
 * @returns timings where `endMs` is end of speech; the 200 ms gap to the next line is implicit
 */
export function computeLineTimings(
  lineSpeechDurationsSec: number[],
): LineTimingEntry[] {
  let cursorMs = 0;
  const out: LineTimingEntry[] = [];
  for (let i = 0; i < lineSpeechDurationsSec.length; i += 1) {
    const sec = lineSpeechDurationsSec[i]!;
    assertNonNegativeFiniteSec(`lineSpeechDurationsSec[${i}]`, sec);
    const speechMs = Math.round(sec * 1000);
    const startMs = cursorMs;
    const endMs = startMs + speechMs;
    out.push({ lineIndex: i, startMs, endMs });
    cursorMs = endMs + LINE_TAIL_SILENCE_MS;
  }
  return out;
}

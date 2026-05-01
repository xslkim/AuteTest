import type { Theme } from "../../src/types/script.js";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { loadFont as loadNotoColorEmoji } from "@remotion/google-fonts/NotoColorEmoji";

/** 主题所需子集与字重尽量收窄，避免默认加载整包触发过量网络请求。 */
loadFont("normal", {
  weights: ["400", "600"],
  subsets: ["latin", "latin-ext", "chinese-simplified"],
  ignoreTooManyRequestsWarning: true,
});

loadJetBrainsMono("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  ignoreTooManyRequestsWarning: true,
});

loadNotoColorEmoji("normal", {
  weights: ["400"],
  subsets: ["emoji"],
  ignoreTooManyRequestsWarning: true,
});

const SANS_STACK = `"Noto Sans SC", "Noto Color Emoji", "Noto Sans", ui-sans-serif, sans-serif`;
const MONO_STACK = `"JetBrains Mono", "Noto Sans SC", ui-monospace, monospace`;

const darkCodeTheme: Theme = {
  name: "dark-code",
  colors: {
    bg: "#0d1117",
    fg: "#e6edf3",
    accent: "#58a6ff",
    muted: "#8b949e",
    code: {
      bg: "#161b22",
      fg: "#e6edf3",
      keyword: "#ff7b72",
      string: "#a5d6ff",
      comment: "#8b949e",
    },
  },
  fonts: { sans: SANS_STACK, mono: MONO_STACK },
  spacing: { unit: 8 },
  subtitle: {
    fontFamily: `"Noto Sans SC", "Noto Color Emoji", "Noto Sans", sans-serif`,
    fontSizePct: 4.5,
    lineHeight: 1.35,
    maxWidthPct: 88,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingPx: 12,
  },
};

const THEMES: Record<string, Theme> = {
  "dark-code": darkCodeTheme,
};

export function getTheme(name: string): Theme {
  const t = THEMES[name];
  if (!t) {
    throw new Error(`Unknown theme "${name}". Supported: ${Object.keys(THEMES).join(", ")}`);
  }
  return t;
}

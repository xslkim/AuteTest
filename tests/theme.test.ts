import { describe, expect, it } from "vitest";

import { getTheme } from "../remotion/engine/theme.js";

describe("getTheme", () => {
  it("dark-code 字幕字体族含 Noto Sans SC（TASKS T5.1）", () => {
    const t = getTheme("dark-code");
    expect(t.subtitle.fontFamily).toContain("Noto Sans SC");
  });

  it("未知主题抛出明确错误", () => {
    expect(() => getTheme("no-such-theme")).toThrow(/Unknown theme/);
  });
});

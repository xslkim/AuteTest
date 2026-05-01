import { pinyin } from "pinyin-pro";

/**
 * PRD §7：CJK → 拼音；移除非 URL/路径安全字符；空白与 `/` 等 → `-`；全小写。
 * 空结果时回退 `project`。
 */
export function slugifyTitle(title: string): string {
  const raw = title.trim();
  if (!raw) return "project";

  const withPinyin = pinyin(raw, {
    toneType: "none",
    type: "string",
    nonZh: "consecutive",
  });

  const lower = withPinyin.toLowerCase();
  const replaced = lower
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return replaced || "project";
}

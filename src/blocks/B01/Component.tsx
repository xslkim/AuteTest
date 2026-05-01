import type { JSX } from "react";
import { AbsoluteFill } from "remotion";
import type { AnimationProps } from "../../types/script.js";

/** Studio / render 占位块组件（fixture）。 */
export default function Component(props: AnimationProps): JSX.Element {
  const { width, height, theme, subtitleSafeBottom } = props;
  const safeBottom = subtitleSafeBottom;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <AbsoluteFill
        style={{
          paddingBottom: safeBottom + 48,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: width * 0.85,
            padding: 48,
            borderRadius: 16,
            backgroundColor: theme.colors.code.bg,
            color: theme.colors.fg,
            fontFamily: theme.fonts.sans,
            fontSize: Math.round(height * 0.045),
          }}
        >
          B01 fixture — {width}×{height}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

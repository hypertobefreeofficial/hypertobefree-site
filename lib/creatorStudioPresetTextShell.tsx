import type { CSSProperties, ReactNode } from "react";
import type { CreatorStudioPresetDecoration } from "./creatorStudioFontPresetCatalog";

type CreatorStudioPresetTextShellProps = {
  decoration?: CreatorStudioPresetDecoration;
  inlineStyle?: CSSProperties;
  textClassName: string;
  children: ReactNode;
  compact?: boolean;
};

export function CreatorStudioPresetTextShell({
  decoration,
  inlineStyle,
  textClassName,
  children,
  compact = false,
}: CreatorStudioPresetTextShellProps) {
  const accent = decoration?.accentLine;
  const accentWidth = accent?.widthPercent ?? 40;
  const accentMarginTop = (accent?.marginTop ?? 8) * (compact ? 0.75 : 1);

  const textNode = (
    <div style={inlineStyle} className={textClassName}>
      {children}
    </div>
  );

  if (!decoration?.wrapperStyle && !accent) {
    return textNode;
  }

  return (
    <div
      className={decoration?.wrapperClassName}
      style={{
        ...decoration?.wrapperStyle,
        maxWidth: "100%",
      }}
    >
      {textNode}
      {accent ? (
        <div
          aria-hidden
          style={{
            height: accent.height,
            width: `${accentWidth}%`,
            maxWidth: "100%",
            marginTop: accentMarginTop,
            marginLeft: "auto",
            marginRight: "auto",
            backgroundColor: accent.color,
            borderRadius: 999,
          }}
        />
      ) : null}
    </div>
  );
}

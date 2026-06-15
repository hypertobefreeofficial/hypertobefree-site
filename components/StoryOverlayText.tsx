import type { CSSProperties, PointerEventHandler } from "react";

type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient"
  | "elegant-script";

type CaptionFont =
  | "classic"
  | "bold"
  | "scripture"
  | "praise"
  | "testimony"
  | "minimal"
  | "grace-script";

type CaptionColor =
  | "white"
  | "black"
  | "deep-navy"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green"
  | `#${string}`;

type CaptionSize = "small" | "medium" | "large" | "extra-large";
type CaptionAlign = "left" | "center" | "right";
type CaptionBackground =
  | "none"
  | "soft-pill"
  | "glass-blur"
  | "dark-banner"
  | "glow-box"
  | "scripture-card";

type StoryOverlayTextProps = {
  alignment?: CaptionAlign | null;
  background?: CaptionBackground | null;
  className?: string;
  color?: CaptionColor | null;
  draggable?: boolean;
  font?: CaptionFont | null;
  maxLines?: number;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  overlayX?: number | null;
  overlayY?: number | null;
  size?: CaptionSize | null;
  style?: CaptionStyle | null;
  text: string | null | undefined;
};

export default function StoryOverlayText({
  alignment,
  background,
  className = "",
  color,
  draggable = false,
  font,
  maxLines,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  overlayX,
  overlayY,
  size,
  style,
  text,
}: StoryOverlayTextProps) {
  const cleanText = text?.trim();

  if (!cleanText) return null;

  const resolvedFont = font ?? getFontFromStyle(style);
  const resolvedBackground = background ?? getBackgroundFromStyle(style);
  const resolvedColor = color ?? getColorFromStyle(style);
  const resolvedAlign = alignment ?? "center";
  const resolvedSize = getScaledSize(size ?? "medium", cleanText.length);
  const x = readPercent(overlayX, 50, 8, 92);
  const y = readPercent(overlayY, 50, 8, 92);
  const positionStyle = getAnchoredPositionStyle(x, y);
  const quoteText =
    resolvedFont === "testimony" || style === "testimony-quote"
      ? `“${cleanText}”`
      : cleanText;
  const inlineColor = getInlineColor(resolvedColor);
  const textShadow = getTextShadow(resolvedColor);
  const clampStyle =
    maxLines && maxLines > 0
      ? {
          display: "-webkit-box",
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: "vertical" as const,
        }
      : {};
  const styleProp: CSSProperties = {
    ...positionStyle,
    boxSizing: "border-box",
    width: "fit-content",
    minWidth: "auto",
    minInlineSize: 0,
    maxWidth: "70%",
    maxInlineSize: "70%",
    maxHeight: "calc(100% - 32px)",
    overflow: "hidden",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    color: inlineColor,
    textShadow,
    ...clampStyle,
  };

  return (
    <div
      role={draggable ? "button" : undefined}
      tabIndex={draggable ? 0 : undefined}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute z-20 leading-tight ${getPointerClass(
        draggable
      )} ${getPaddingClass(resolvedBackground)} ${getSizeClass(
        resolvedSize
      )} ${getAlignClass(resolvedAlign)} ${getFontClass(
        resolvedFont
      )} ${getBackgroundClass(resolvedBackground)} ${getColorClass(
        resolvedColor
      )} ${className}`}
      style={styleProp}
      aria-label={draggable ? "Drag video message" : undefined}
    >
      {quoteText}
    </div>
  );
}

function getAnchoredPositionStyle(x: number, y: number): CSSProperties {
  const transformParts: string[] = [];
  const style: CSSProperties = {};

  if (x <= 25) {
    style.left = "16px";
  } else if (x >= 75) {
    style.right = "16px";
  } else {
    style.left = `${x}%`;
    transformParts.push("translateX(-50%)");
  }

  if (y <= 25) {
    style.top = "16px";
  } else if (y >= 75) {
    style.bottom = "16px";
  } else {
    style.top = `${y}%`;
    transformParts.push("translateY(-50%)");
  }

  if (transformParts.length > 0) {
    style.transform = transformParts.join(" ");
  }

  return style;
}

function readPercent(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(value, min), max);
}

function getPointerClass(draggable: boolean) {
  return draggable
    ? "cursor-grab active:cursor-grabbing"
    : "pointer-events-none";
}

function getPaddingClass(background: CaptionBackground) {
  return background === "none" ? "px-0 py-0" : "px-4 py-3";
}

function getSizeClass(size: CaptionSize) {
  if (size === "small") return "text-[clamp(0.9rem,2vw,1.3rem)]";
  if (size === "large") return "text-[clamp(1.4rem,4vw,2.5rem)]";
  if (size === "extra-large") return "text-[clamp(1.8rem,5vw,3.2rem)]";
  return "text-[clamp(1.1rem,3vw,1.8rem)]";
}

function getScaledSize(size: CaptionSize, textLength: number): CaptionSize {
  if (textLength > 320) return "small";

  const sizes: CaptionSize[] = ["small", "medium", "large", "extra-large"];
  const currentIndex = sizes.indexOf(size);
  const safeIndex = currentIndex >= 0 ? currentIndex : 1;
  const scaleDownSteps = textLength > 220 ? 2 : textLength > 120 ? 1 : 0;

  return sizes[Math.max(0, safeIndex - scaleDownSteps)];
}

function getAlignClass(align: CaptionAlign) {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

function getFontClass(font: CaptionFont) {
  if (font === "bold") return "font-sans font-black tracking-tight";
  if (font === "scripture") return "font-serif font-semibold italic";
  if (font === "praise") return "font-serif font-black italic tracking-wide";
  if (font === "testimony") return "font-sans font-black";
  if (font === "minimal") return "font-sans font-semibold";
  if (font === "grace-script") return "font-[cursive] italic tracking-wide";
  return "font-sans font-semibold";
}

function getBackgroundClass(background: CaptionBackground) {
  if (background === "none") return "shadow-none";
  if (background === "glass-blur") {
    return "rounded-[1.5rem] bg-white/20 shadow-lg ring-1 ring-white/50 backdrop-blur-md";
  }
  if (background === "dark-banner") {
    return "rounded-2xl bg-black/75 shadow-lg ring-1 ring-white/10 backdrop-blur";
  }
  if (background === "glow-box") {
    return "rounded-[1.5rem] bg-gradient-to-r from-[#0b63ce]/75 via-amber-300/60 to-[#0b63ce]/70 shadow-lg shadow-amber-300/30 ring-1 ring-white/50 backdrop-blur";
  }
  if (background === "scripture-card") {
    return "rounded-[1.5rem] bg-[#fff4d6]/95 shadow-lg ring-1 ring-white/70 backdrop-blur";
  }
  return "rounded-2xl bg-white/90 shadow-lg ring-1 ring-white/70 backdrop-blur";
}

function getColorClass(color: CaptionColor) {
  if (color.startsWith("#")) return "";
  if (color === "black") return "!text-slate-950";
  if (color === "deep-navy") return "!text-[#062a57]";
  if (color === "soft-gold") return "!text-amber-200";
  if (color === "prayer-blue") return "!text-blue-200";
  if (color === "warm-cream") return "!text-[#fff4d6]";
  if (color === "praise-green") return "!text-emerald-200";
  return "!text-white";
}

function getInlineColor(color: CaptionColor) {
  return color.startsWith("#") ? color : undefined;
}

function getTextShadow(color: CaptionColor) {
  if (color === "black" || color === "deep-navy" || isDarkColor(color)) {
    return "0 1px 10px rgba(255,255,255,0.72)";
  }

  return "0 2px 12px rgba(0,0,0,0.62)";
}

function getFontFromStyle(style?: CaptionStyle | null): CaptionFont {
  if (style === "bold-center") return "bold";
  if (style === "scripture-card") return "scripture";
  if (style === "praise-glow") return "praise";
  if (style === "testimony-quote") return "testimony";
  if (style === "minimal-white" || style === "black-outline") return "minimal";
  if (style === "elegant-script") return "grace-script";
  return "classic";
}

function getBackgroundFromStyle(
  style?: CaptionStyle | null
): CaptionBackground {
  if (style === "bottom-banner") return "dark-banner";
  if (style === "scripture-card") return "scripture-card";
  if (style === "soft-gradient" || style === "praise-glow") {
    return "glow-box";
  }
  if (style === "minimal-white" || style === "black-outline") return "none";
  return "soft-pill";
}

function getColorFromStyle(style?: CaptionStyle | null): CaptionColor {
  if (style === "scripture-card" || style === "testimony-quote") {
    return "deep-navy";
  }
  if (style === "highlight-box" || style === "praise-glow") return "black";
  return "white";
}

function isDarkColor(color: CaptionColor) {
  if (!color.startsWith("#") || color.length !== 7) return false;

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness < 100;
}

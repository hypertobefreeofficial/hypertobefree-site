"use client";

import { cn } from "../../lib/cn";

type Hero3DForegroundProps = {
  reducedMotion?: boolean;
};

/** Soft grass, blurred plants, and tiny flowers — low opacity immersion layer. */
export function Hero3DForeground({ reducedMotion = false }: Hero3DForegroundProps) {
  const drift = reducedMotion ? "" : "htbf-hero3d-flora-sway";

  return (
    <>
      {/* Soft grass silhouette along bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-[18%]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(12,40,30,0.08) 40%, rgba(8,28,22,0.22) 100%)",
        }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute -bottom-2 left-[4%] h-16 w-32 rounded-t-[80%] bg-[#1a3d2e]/25 blur-md",
          drift
        )}
        aria-hidden
      />
      <div
        className={cn(
          "absolute bottom-0 left-[22%] h-20 w-24 rounded-t-[70%] bg-[#234a38]/20 blur-lg",
          drift
        )}
        style={{ animationDelay: "-3s" }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute -bottom-1 right-[8%] h-14 w-36 rounded-t-[90%] bg-[#1a3d2e]/22 blur-md",
          drift
        )}
        style={{ animationDelay: "-5s" }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute bottom-1 right-[28%] h-12 w-20 rounded-t-[65%] bg-[#2d5240]/18 blur-lg",
          drift
        )}
        style={{ animationDelay: "-1.5s" }}
        aria-hidden
      />

      {/* Tiny flowers — cream + soft gold, very subtle */}
      {[
        { left: "14%", bottom: "12%", size: 6, color: "rgba(255,240,210,0.35)" },
        { left: "32%", bottom: "8%", size: 5, color: "rgba(255,230,190,0.28)" },
        { left: "68%", bottom: "10%", size: 5, color: "rgba(255,245,220,0.32)" },
        { left: "82%", bottom: "14%", size: 4, color: "rgba(255,235,200,0.25)" },
      ].map((flower, i) => (
        <span
          key={i}
          className={cn(
            "absolute rounded-full blur-[1px]",
            !reducedMotion && "htbf-hero3d-flora-sway"
          )}
          style={{
            left: flower.left,
            bottom: flower.bottom,
            width: flower.size,
            height: flower.size,
            background: flower.color,
            animationDelay: `${-i * 1.2}s`,
          }}
          aria-hidden
        />
      ))}

      {/* Blurred foreground plants */}
      <div
        className="absolute bottom-[6%] left-[6%] h-24 w-16 opacity-30 blur-xl"
        style={{
          background:
            "radial-gradient(ellipse at bottom, rgba(30,70,50,0.5) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="absolute bottom-[4%] right-[10%] h-28 w-20 opacity-25 blur-2xl"
        style={{
          background:
            "radial-gradient(ellipse at bottom, rgba(25,60,45,0.45) 0%, transparent 68%)",
        }}
        aria-hidden
      />
    </>
  );
}

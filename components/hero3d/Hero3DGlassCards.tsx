"use client";

import { Globe2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type CardShellProps = {
  reducedMotion?: boolean;
  floatClass?: string;
  className?: string;
  children: React.ReactNode;
};

function CardShell({
  reducedMotion = false,
  floatClass = "htbf-hero3d-card-float",
  className,
  children,
}: CardShellProps) {
  return (
    <div className={cn(!reducedMotion && floatClass, className)}>{children}</div>
  );
}

export function Hero3DVideoCard({
  reducedMotion = false,
  className,
}: {
  reducedMotion?: boolean;
  className?: string;
}) {
  return (
    <CardShell
      reducedMotion={reducedMotion}
      className={cn(
        "absolute bottom-[7%] left-3 w-[min(82%,17.5rem)] md:inset-auto md:left-[-4%] md:top-[10%] md:w-[min(88%,19.5rem)]",
        className
      )}
    >
      <div
        className={cn(
          "htbf-hero3d-glass htbf-hero3d-glass-mobile relative overflow-hidden rounded-[1rem] p-3 md:rounded-[1.25rem] md:p-[1.125rem]",
          !reducedMotion && "htbf-hero3d-enter-card"
        )}
      >
        {!reducedMotion ? (
          <span className="htbf-hero3d-glass-sheen" aria-hidden />
        ) : null}
        <div className="htbf-hero3d-glass-inner flex items-center gap-2.5 md:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-white/75 shadow-sm ring-1 ring-white/60 md:h-11 md:w-11 md:rounded-2xl">
            <Play className="h-[1.05rem] w-[1.05rem] fill-[#0b63ce] text-[#0b63ce] md:h-5 md:w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-heading font-black text-slate-900 md:text-sm">
              Latest Video Story
            </p>
            <p className="truncate text-[11px] font-medium text-slate-500 md:text-xs">
              Freedom • 1 min watch
            </p>
          </div>
        </div>

        <p className="htbf-hero3d-glass-inner mt-2.5 line-clamp-2 text-[12.5px] leading-[1.35] text-slate-700 md:mt-3.5 md:text-sm md:leading-6">
          “I woke up with peace after weeks of anxiety.”
        </p>

        <div className="htbf-hero3d-glass-inner mt-2.5 flex flex-wrap gap-1.5 md:mt-3.5">
          {["Amen", "Praying", "Encouraged"].map((label) => (
            <span
              key={label}
              className="rounded-full bg-white/55 px-2.5 py-[3px] text-[11px] font-heading font-bold text-slate-600 ring-1 ring-white/50 md:py-1"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

export function Hero3DWorldCard({
  reducedMotion = false,
  className,
}: {
  reducedMotion?: boolean;
  className?: string;
}) {
  return (
    <CardShell
      reducedMotion={reducedMotion}
      floatClass="htbf-hero3d-card-float-delayed"
      className={cn(
        "absolute hidden bottom-[6%] left-[6%] w-[min(82%,17.5rem)] md:block md:bottom-[8%] md:left-[8%]",
        className
      )}
    >
      <div
        className={cn(
          "htbf-hero3d-glass relative overflow-hidden rounded-[1.25rem] p-4 sm:p-[1.125rem]",
          !reducedMotion && "htbf-hero3d-enter-card-delayed"
        )}
      >
        {!reducedMotion ? (
          <span className="htbf-hero3d-glass-sheen" aria-hidden />
        ) : null}
        <div className="htbf-hero3d-glass-inner mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-heading font-black text-slate-900">
            From Around the World
          </p>
          <Globe2 className="h-4 w-4 shrink-0 text-[#0b63ce]" aria-hidden />
        </div>

        <div className="htbf-hero3d-glass-inner space-y-1.5 text-sm text-slate-700">
          {[
            ["USA", "Praise Report"],
            ["Nigeria", "Testimony"],
            ["Philippines", "Prayer"],
          ].map(([place, type]) => (
            <div
              key={place}
              className="flex justify-between gap-3 rounded-2xl bg-white/45 px-3 py-2 ring-1 ring-white/40"
            >
              <span className="font-medium">{place}</span>
              <span className="text-slate-500">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

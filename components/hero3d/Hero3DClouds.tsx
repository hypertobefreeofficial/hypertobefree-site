"use client";

import { cn } from "../../lib/cn";

type CloudClusterProps = {
  className?: string;
  driftClass?: string;
  opacity?: number;
  warm?: boolean;
};

/** Compound cloud shape built from overlapping soft ellipses. */
function CloudCluster({
  className,
  driftClass = "",
  opacity = 1,
  warm = false,
}: CloudClusterProps) {
  const base = warm ? "bg-[#ffe8c8]" : "bg-white";
  return (
    <div className={cn("absolute", driftClass, className)} style={{ opacity }} aria-hidden>
      <div className={cn("absolute h-7 w-20 rounded-full blur-xl", base, warm ? "opacity-30" : "opacity-22")} />
      <div
        className={cn(
          "absolute left-6 top-2 h-9 w-16 rounded-full blur-xl",
          base,
          warm ? "opacity-25" : "opacity-18"
        )}
      />
      <div
        className={cn(
          "absolute left-14 top-1 h-6 w-14 rounded-full blur-lg",
          base,
          warm ? "opacity-20" : "opacity-15"
        )}
      />
      <div
        className={cn(
          "absolute left-3 top-4 h-5 w-24 rounded-full blur-2xl",
          base,
          warm ? "opacity-18" : "opacity-12"
        )}
      />
    </div>
  );
}

type Hero3DCloudsProps = {
  variant: "far" | "near";
  reducedMotion?: boolean;
};

export function Hero3DClouds({ variant, reducedMotion = false }: Hero3DCloudsProps) {
  const driftA = reducedMotion ? "" : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-a";
  const driftB = reducedMotion ? "" : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-b";
  const driftC = reducedMotion ? "" : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-c";

  if (variant === "far") {
    return (
      <>
        <CloudCluster
          className="left-[2%] top-[18%]"
          driftClass={driftA}
          opacity={0.85}
        />
        <CloudCluster
          className="right-[4%] top-[22%]"
          driftClass={driftB}
          opacity={0.7}
          warm
        />
        <CloudCluster
          className="left-[36%] top-[14%]"
          driftClass={driftC}
          opacity={0.55}
        />
        {/* Horizon fade mask for far clouds */}
        <div
          className="absolute inset-x-0 bottom-[38%] h-[30%]"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(10,22,40,0.35) 100%)",
          }}
          aria-hidden
        />
      </>
    );
  }

  return (
    <>
      <CloudCluster
        className="-left-6 top-[34%] scale-125"
        driftClass={driftB}
        opacity={0.9}
      />
      <CloudCluster
        className="-right-8 top-[38%] scale-110"
        driftClass={driftA}
        opacity={0.75}
        warm
      />
      <CloudCluster
        className="left-[18%] top-[42%] scale-90"
        driftClass={driftC}
        opacity={0.65}
      />
      <div
        className="absolute inset-x-0 bottom-[28%] h-[25%]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(8,18,32,0.28) 100%)",
        }}
        aria-hidden
      />
    </>
  );
}

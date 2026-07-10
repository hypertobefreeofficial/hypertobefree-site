"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger delay in milliseconds, applied once the element enters the viewport. */
  delay?: number;
};

/**
 * Reveals its children with a gentle fade + rise the first time they scroll into
 * view. Pure transform/opacity (GPU-cheap), fires once, and disconnects. Honors
 * prefers-reduced-motion via CSS. Falls back to visible when IntersectionObserver
 * is unavailable so content is never trapped hidden.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("htbf-reveal", visible && "htbf-reveal-in", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

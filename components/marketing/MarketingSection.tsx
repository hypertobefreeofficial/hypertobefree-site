import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type MarketingSectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  as?: "section" | "div";
};

export function MarketingSection({
  id,
  children,
  className,
  innerClassName,
  as: Tag = "section",
}: MarketingSectionProps) {
  return (
    <Tag id={id} className={cn("px-4 sm:px-6", className)}>
      <div className={cn("mx-auto max-w-7xl py-12 md:py-16", innerClassName)}>
        {children}
      </div>
    </Tag>
  );
}

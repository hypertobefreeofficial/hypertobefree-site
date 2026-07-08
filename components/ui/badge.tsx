import * as React from "react";
import { cn } from "../../lib/cn";

type BadgeVariant = "default" | "blue" | "amber" | "muted" | "onDark";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-htbf-blue",
  amber: "bg-amber-50 text-amber-700",
  muted: "bg-slate-100 text-slate-500",
  onDark: "bg-white/10 text-blue-100",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-heading font-bold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

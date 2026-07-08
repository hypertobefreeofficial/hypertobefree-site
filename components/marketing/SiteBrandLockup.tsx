import { cn } from "../../lib/cn";

type SiteBrandLockupProps = {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
};

export function SiteBrandLockup({
  size = "md",
  showTagline = true,
  className,
}: SiteBrandLockupProps) {
  const titleSize =
    size === "sm" ? "text-lg" : size === "lg" ? "text-2xl" : "text-xl";
  const logoSize =
    size === "sm" ? "h-10 w-10" : size === "lg" ? "h-14 w-14" : "h-12 w-12";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200",
          logoSize
        )}
      >
        <img
          src="/images/htbf-logo.png"
          alt="HTBF logo"
          className="h-full w-full object-contain p-1"
        />
      </div>

      <div>
        <div
          className={cn(
            "font-heading font-black tracking-tight text-htbf-navy",
            titleSize
          )}
        >
          HTBF
        </div>
        {showTagline && (
          <div className="-mt-0.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Hyper to Be Free
          </div>
        )}
      </div>
    </div>
  );
}

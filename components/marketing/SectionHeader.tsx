import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end",
        className
      )}
    >
      <div>
        <p className="text-sm font-heading font-bold uppercase tracking-[0.22em] text-htbf-blue">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-heading text-3xl font-black tracking-tight text-htbf-navy-deep md:text-4xl">
          {title}
        </h2>
      </div>

      {action && (
        <Button href={action.href} variant="secondary" size="md" className="w-fit">
          {action.label}
        </Button>
      )}
    </div>
  );
}

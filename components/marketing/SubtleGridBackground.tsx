type SubtleGridBackgroundProps = {
  className?: string;
};

export function SubtleGridBackground({ className = "" }: SubtleGridBackgroundProps) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,99,206,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(11,99,206,0.04)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(255,196,87,0.28),transparent_36%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-htbf-surface/20 via-transparent to-htbf-surface" />
    </div>
  );
}

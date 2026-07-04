type HTBFWatermarkProps = {
  className?: string;
};

export default function HTBFWatermark({ className = "" }: HTBFWatermarkProps) {
  return (
    <img
      src="/images/htbf-logo.png"
      alt=""
      aria-hidden
      className={`pointer-events-none absolute right-3 top-3 z-30 h-6 w-auto opacity-[0.82] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] sm:right-4 sm:top-4 sm:h-7 [filter:drop-shadow(0_0_6px_rgba(255,255,255,0.35))] ${className}`}
    />
  );
}

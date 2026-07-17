type CreationCenterTemplatePostVariant = "preview" | "feed" | "detail";

type CreationCenterTemplatePostVisualProps = {
  className?: string;
  formatLabel?: string | null;
  imagePath?: string | null;
  templateLabel: string;
  text: string;
  variant?: CreationCenterTemplatePostVariant;
};

export default function CreationCenterTemplatePostVisual({
  className = "",
  formatLabel,
  imagePath,
  templateLabel,
  text,
  variant = "preview",
}: CreationCenterTemplatePostVisualProps) {
  const isDetail = variant === "detail";
  const frameClass =
    variant === "detail"
      ? "relative min-h-[68dvh] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-4 text-white shadow-lg shadow-blue-950/10 ring-1 ring-blue-100 sm:min-h-[42rem] sm:p-6"
      : variant === "feed"
        ? "relative min-h-[20rem] overflow-hidden rounded-none bg-[#062a57] p-5 text-white shadow-lg shadow-blue-950/10 ring-0 sm:min-h-[26rem] md:rounded-[0.625rem] md:ring-1 md:ring-blue-100 sm:p-7"
        : "relative min-h-[20rem] overflow-hidden rounded-[1.5rem] bg-[#062a57] p-5 text-white shadow-lg shadow-blue-950/10 ring-1 ring-blue-100 sm:min-h-[26rem] sm:p-7";
  const innerClass =
    variant === "detail"
      ? "relative z-10 flex min-h-[calc(68dvh-2rem)] max-w-lg flex-col justify-between sm:min-h-[39rem]"
      : "relative z-10 flex min-h-[17.5rem] max-w-lg flex-col justify-between sm:min-h-[22.5rem]";
  const textClass =
    variant === "detail"
      ? "mt-6 whitespace-pre-wrap break-words text-[clamp(1.45rem,7vw,2.35rem)] font-black leading-tight text-white drop-shadow-sm sm:text-4xl sm:leading-tight"
      : "mt-6 line-clamp-4 whitespace-pre-wrap break-words text-lg font-black leading-7 text-white drop-shadow-sm sm:text-xl";

  return (
    <div className={`${frameClass} ${className}`.trim()}>
      {imagePath && (
        <img
          src={imagePath}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#031d3d]/90 via-[#062a57]/55 to-transparent" />

      <div className={innerClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/20 backdrop-blur-sm">
              {templateLabel}
            </span>
            {formatLabel && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
                {formatLabel}
              </span>
            )}
          </div>

          <img
            src="/images/htbf-logo.png"
            alt=""
            loading="lazy"
            className="pointer-events-none h-9 w-9 shrink-0 rounded-full bg-white/80 object-contain p-1.5 opacity-85 shadow-sm ring-1 ring-white/50"
          />
        </div>

        <p
          className={textClass}
          style={{
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {text || (isDetail ? "HTBF post" : "Your story will begin to take shape here.")}
        </p>
      </div>
    </div>
  );
}

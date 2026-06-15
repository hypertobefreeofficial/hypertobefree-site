type VideoTemplate =
  | "none"
  | "htbf-logo"
  | "freedom-silhouette"
  | "shared-through-htbf"
  | "freedom-story"
  | "prayer-moment"
  | "praise-report"
  | "god-did-it";

type StoryMediaStampProps = {
  stamp: VideoTemplate;
};

export default function StoryMediaStamp({ stamp }: StoryMediaStampProps) {
  if (stamp === "none") return null;

  if (stamp === "htbf-logo") {
    return (
      <img
        src="/images/htbf-logo.png"
        alt=""
        className="pointer-events-none absolute right-4 top-4 z-[3] h-10 w-10 rounded-full object-contain opacity-65 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
      />
    );
  }

  if (stamp === "freedom-silhouette") {
    return (
      <img
        src="/images/hero-freedom.png"
        alt=""
        className="pointer-events-none absolute bottom-4 right-4 z-[3] h-24 w-20 object-contain opacity-20 mix-blend-screen"
      />
    );
  }

  if (stamp === "shared-through-htbf") {
    return (
      <StoryTextStamp
        className="left-4 top-4 bg-black/35 text-white/70 ring-white/20"
        label="Shared Through HTBF"
      />
    );
  }

  if (stamp === "freedom-story") {
    return <StoryTextStamp className="bottom-4 left-4" label="Freedom Story" />;
  }

  if (stamp === "prayer-moment") {
    return (
      <StoryTextStamp
        className="left-4 top-4 bg-blue-950/45 text-blue-50/80 ring-blue-100/20"
        label="Prayer Moment"
      />
    );
  }

  if (stamp === "praise-report") {
    return (
      <StoryTextStamp
        className="right-4 top-4 bg-amber-300/20 text-amber-50/85 ring-amber-100/25"
        label="Praise Report"
      />
    );
  }

  return (
    <StoryTextStamp
      className="bottom-4 right-4 bg-emerald-300/20 text-emerald-50/85 ring-emerald-100/25"
      label="God Did It"
    />
  );
}

function StoryTextStamp({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute z-[3] rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/75 ring-1 backdrop-blur-sm ${className}`}
    >
      {label}
    </div>
  );
}

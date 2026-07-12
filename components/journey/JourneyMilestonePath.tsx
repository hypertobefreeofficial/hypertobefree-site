import type { ReactNode } from "react";
import {
  CheckCircle2,
  Flame,
  Footprints,
  Lightbulb,
  Send,
  Users,
} from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type JourneyMilestonePathProps = {
  myStoriesCount: number;
  encouragementTotal: number;
  encouragementEncouraged: number;
  godDidItCount: number;
};

type PathStep = {
  active: boolean;
  number: string;
  icon: ReactNode;
  title: string;
  text: string;
  accent: "blue" | "violet" | "pink" | "gold" | "green";
};

export default function JourneyMilestonePath({
  myStoriesCount,
  encouragementTotal,
  encouragementEncouraged,
  godDidItCount,
}: JourneyMilestonePathProps) {
  const steps: PathStep[] = [
    {
      active: myStoriesCount > 0,
      number: "01",
      icon: <Lightbulb className="h-5 w-5" aria-hidden />,
      title: "God Moved",
      text: "Something happened that was worth remembering.",
      accent: "violet",
    },
    {
      active: myStoriesCount > 0,
      number: "02",
      icon: <Send className="h-5 w-5" aria-hidden />,
      title: "You Shared",
      text:
        myStoriesCount > 0
          ? `You have shared ${myStoriesCount} approved ${
              myStoriesCount === 1 ? "story" : "stories"
            }.`
          : "Share a testimony, praise report, prayer request, or video.",
      accent: "blue",
    },
    {
      active: encouragementTotal > 0,
      number: "03",
      icon: <Users className="h-5 w-5" aria-hidden />,
      title: "The Community Responded",
      text:
        encouragementTotal > 0
          ? `Your stories have received ${encouragementTotal} response${
              encouragementTotal === 1 ? "" : "s"
            }.`
          : "Responses to your stories will appear here.",
      accent: "pink",
    },
    {
      active: godDidItCount > 0,
      number: "04",
      icon: <CheckCircle2 className="h-5 w-5" aria-hidden />,
      title: "God Did It",
      text:
        godDidItCount > 0
          ? `${godDidItCount} of your prayer ${
              godDidItCount === 1 ? "request has" : "requests have"
            } been marked answered.`
          : "Answered prayer moments will appear here.",
      accent: "gold",
    },
    {
      active: encouragementEncouraged > 0,
      number: "05",
      icon: <Flame className="h-5 w-5" aria-hidden />,
      title: "Lives Were Encouraged",
      text:
        encouragementEncouraged > 0
          ? `${encouragementEncouraged} ${
              encouragementEncouraged === 1 ? "person" : "people"
            } ${
              encouragementEncouraged === 1 ? "was" : "were"
            } encouraged by your stories.`
          : "Encouragement impact will grow as people respond.",
      accent: "green",
    },
  ];

  return (
    <section className={styles.sectionCard} aria-labelledby="journey-path-title">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <Footprints className="h-6 w-6" aria-hidden />
        </div>

        <div>
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
            Freedom Milestones
          </div>
          <h2 id="journey-path-title" className={styles.sectionTitle}>
            Your HTBF journey path
          </h2>
        </div>
      </div>

      <ol className={styles.pathList}>
        {steps.map((step) => (
          <li key={step.number} className={styles.pathListItem}>
            <PathStepCard {...step} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function PathStepCard({
  active,
  number,
  icon,
  title,
  text,
  accent,
}: PathStep) {
  const accentStyles: Record<PathStep["accent"], string> = {
    blue: "bg-[#0b63ce] text-white ring-blue-200",
    violet: "bg-violet-600 text-white ring-violet-200",
    pink: "bg-pink-600 text-white ring-pink-200",
    gold: "bg-amber-500 text-white ring-amber-200",
    green: "bg-emerald-600 text-white ring-emerald-200",
  };

  return (
    <article
      className={`${styles.pathStep} ${
        active ? styles.pathStepActive : styles.pathStepUpcoming
      }`}
      aria-current={active ? "step" : undefined}
    >
      <div className={styles.pathStepInner}>
        <div
          className={`${styles.pathNode} ${
            active
              ? accentStyles[accent]
              : "bg-white text-[#0b63ce] ring-slate-100"
          }`}
        >
          {icon}
        </div>

        <div className={styles.pathStepCopy}>
          <div className={styles.pathNumber}>{number}</div>
          <div className={styles.pathTitle}>{title}</div>
          <p className={styles.pathText}>{text}</p>
        </div>
      </div>
    </article>
  );
}

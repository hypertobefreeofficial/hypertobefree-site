import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  MessageCircleHeart,
  Users,
} from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type EncouragementImpact = {
  total: number;
  amen: number;
  praiseGod: number;
  encouraged: number;
  praying: number;
};

type JourneyImpactCardsProps = {
  prayerWatchlistCount: number;
  godDidItCount: number;
  encouragementImpact: EncouragementImpact;
};

export default function JourneyImpactCards({
  prayerWatchlistCount,
  godDidItCount,
  encouragementImpact,
}: JourneyImpactCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Impact cards">
      <ImpactCard
        icon={<Users className="h-6 w-6" aria-hidden />}
        eyebrow="My Prayer Watchlist"
        title={`${prayerWatchlistCount} Prayer ${
          prayerWatchlistCount === 1 ? "Request" : "Requests"
        }`}
        text="These are prayer requests you joined by selecting I'm Praying."
        href="/prayer"
        button="View Prayer"
      />

      <ImpactCard
        icon={<CheckCircle2 className="h-6 w-6" aria-hidden />}
        eyebrow="My God Did It Moments"
        title={`${godDidItCount} Answered`}
        text="These are your prayer requests that have been marked answered."
        href="/prayer"
        button="View Answered"
      />

      <ImpactCard
        icon={<MessageCircleHeart className="h-6 w-6" aria-hidden />}
        eyebrow="Encouragement Impact"
        title={`${encouragementImpact.total} Responses`}
        text={`Amen: ${encouragementImpact.amen} • Praise God: ${encouragementImpact.praiseGod} • Encouraged: ${encouragementImpact.encouraged} • Praying: ${encouragementImpact.praying}`}
        href="/feed"
        button="Open Feed"
      />
    </section>
  );
}

function ImpactCard({
  icon,
  eyebrow,
  title,
  text,
  href,
  button,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  button: string;
}) {
  return (
    <article className={styles.impactCard}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>

      <div className={styles.sectionEyebrow}>{eyebrow}</div>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <p className={styles.sectionBody}>{text}</p>

      <Link href={href} className={`${styles.impactButton} ${styles.primaryButton} mt-5`}>
        {button}
      </Link>
    </article>
  );
}

import Link from "next/link";
import {
  HandHeart,
  HeartHandshake,
  NotebookPen,
  Send,
  Target,
} from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type JourneyQuickActionsProps = {
  onReflect: () => void;
};

export default function JourneyQuickActions({
  onReflect,
}: JourneyQuickActionsProps) {
  return (
    <section className={styles.sectionCard} aria-labelledby="journey-mission-title">
      <div className="mb-5 flex items-center gap-3">
        <div className={styles.cardIcon}>
          <Target className="h-6 w-6" aria-hidden />
        </div>

        <div>
          <div className={styles.sectionEyebrow}>Today&apos;s Mission</div>
          <h2 id="journey-mission-title" className={styles.sectionTitle}>
            Do one thing that brings encouragement.
          </h2>
        </div>
      </div>

      <div className={styles.gridFour}>
        <Link href="/prayer" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <HeartHandshake className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-black text-[#062a57]">Pray</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Stand with one request
            </p>
          </div>
        </Link>

        <Link href="/feed" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <HandHeart className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-black text-[#062a57]">Encourage</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Respond to one story
            </p>
          </div>
        </Link>

        <Link href="/share-your-story" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <Send className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-black text-[#062a57]">Testify</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Share what God did
            </p>
          </div>
        </Link>

        <button type="button" onClick={onReflect} className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <NotebookPen className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-black text-[#062a57]">Reflect</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Write in your reflection room
            </p>
          </div>
        </button>
      </div>
    </section>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./JourneyInbox.module.css";

type JourneyInboxHeaderProps = {
  unreadCount: string;
  showBackToList?: boolean;
  onBackToList?: () => void;
  title?: string;
  subtitle?: string;
};

export default function JourneyInboxHeader({
  unreadCount,
  showBackToList = false,
  onBackToList,
  title = "Journey Inbox",
  subtitle = "Messages, prayer updates, and milestones",
}: JourneyInboxHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        {showBackToList ? (
          <button
            type="button"
            onClick={onBackToList}
            className={styles.backLink}
            aria-label="Back to inbox list"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Inbox
          </button>
        ) : (
          <Link href="/journey" className={styles.backLink}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Journey
          </Link>
        )}

        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>Hyper To Be Free</div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>

        <span className={styles.unreadPill}>{unreadCount} unread</span>
      </div>
    </header>
  );
}

import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type JourneyInboxCardProps = {
  unreadCount: number;
  formattedUnreadCount: string;
  priorityFirst?: boolean;
};

export default function JourneyInboxCard({
  unreadCount,
  formattedUnreadCount,
  priorityFirst = false,
}: JourneyInboxCardProps) {
  return (
    <Link
      href="/journey/inbox"
      className={`${styles.inboxCard} ${priorityFirst ? styles.inboxFirst : ""}`}
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        <Inbox className="h-6 w-6" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            {formattedUnreadCount}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className={styles.sectionEyebrow}>Journey Inbox</div>
        <h2 className={styles.sectionTitle}>Messages, updates, and milestones</h2>
        <p className={styles.sectionBody}>
          {unreadCount > 0
            ? `You have ${formattedUnreadCount} unread conversation${
                unreadCount === 1 ? "" : "s"
              }.`
            : "Messages, updates, and milestones from your HTBF journey."}
        </p>
        <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
          {formattedUnreadCount} unread conversation
          {unreadCount === 1 ? "" : "s"}
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}

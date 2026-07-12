import {
  Award,
  CheckCircle2,
  HeartHandshake,
  Inbox,
  MessageCircle,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import type { InboxListItem } from "../../../lib/journey/inbox/types";
import { INBOX_CARD_STYLES } from "../../../lib/journey/inbox/constants";
import {
  formatMessageDateShort,
  formatUnreadBadge,
  getInboxRowPreview,
} from "../../../lib/journey/inbox/utils";
import styles from "./JourneyInbox.module.css";

type JourneyConversationRowProps = {
  item: InboxListItem;
  selected: boolean;
  onSelect: () => void;
};

export default function JourneyConversationRow({
  item,
  selected,
  onSelect,
}: JourneyConversationRowProps) {
  const preview = getInboxRowPreview(item);
  const style = INBOX_CARD_STYLES[preview.kind];

  return (
    <button
      type="button"
      role="listitem"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={`${styles.rowButton} ${selected ? styles.rowSelected : ""}`}
    >
      <div className={styles.rowAvatar} aria-hidden>
        <CategoryIcon kind={preview.kind} isThread={item.kind === "thread"} />
      </div>

      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <div className={styles.rowTitle}>{preview.senderLabel}</div>
          <time className={styles.rowTime} dateTime={preview.timestamp}>
            {formatMessageDateShort(preview.timestamp)}
          </time>
        </div>

        <div className="text-sm font-bold text-[#062a57]">{preview.title}</div>
        <div className={styles.rowPreview}>{preview.body}</div>

        <div className={styles.rowMeta}>
          <span className={styles.typeBadge}>{style.label}</span>
          {preview.hasVideo ? (
            preview.videoUrl ? (
              <Video className="h-4 w-4 text-[#0b63ce]" aria-label="Video message" />
            ) : (
              <Video className="h-4 w-4 text-[#0b63ce]" aria-label="Includes video" />
            )
          ) : null}
          {preview.unreadCount > 0 ? (
            <span className={styles.unreadBadge}>
              {formatUnreadBadge(preview.unreadCount)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function CategoryIcon({
  kind,
  isThread,
}: {
  kind: keyof typeof INBOX_CARD_STYLES;
  isThread: boolean;
}) {
  if (isThread) return <HeartHandshake className="h-5 w-5" />;

  switch (kind) {
    case "approval":
      return <CheckCircle2 className="h-5 w-5" />;
    case "milestone":
      return <Award className="h-5 w-5" />;
    case "encouragement":
      return <Sparkles className="h-5 w-5" />;
    case "prayer_video_reply":
      return <Video className="h-5 w-5" />;
    case "testimony_response":
      return <MessageCircle className="h-5 w-5" />;
    case "scripture_share":
      return <Users className="h-5 w-5" />;
    default:
      return <Inbox className="h-5 w-5" />;
  }
}

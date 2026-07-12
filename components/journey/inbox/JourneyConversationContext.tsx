import type { InboxMessage, InboxThread, PrayerStorySummary } from "../../../lib/journey/inbox/types";
import {
  formatMessageDate,
  getInboxMessageKind,
  getExplicitCategoryLabel,
} from "../../../lib/journey/inbox/utils";
import { INBOX_CARD_STYLES } from "../../../lib/journey/inbox/constants";
import styles from "./JourneyInbox.module.css";

type JourneyConversationContextProps = {
  thread?: InboxThread | null;
  message?: InboxMessage | null;
  story?: PrayerStorySummary;
};

export default function JourneyConversationContext({
  thread,
  message,
  story,
}: JourneyConversationContextProps) {
  if (thread) {
    return (
      <div>
        <h2 className={styles.contextTitle}>Conversation details</h2>

        <div className={styles.contextCard}>
          <div className={styles.contextTitle}>Prayer thread</div>
          <p className={styles.contextBody}>
            {thread.messages.length} message
            {thread.messages.length === 1 ? "" : "s"} in this private thread.
          </p>
          <p className={styles.privacyNote}>
            Latest update {formatMessageDate(thread.latestMessage.created_at)}
          </p>
        </div>

        {story ? (
          <div className={styles.contextCard}>
            <div className={styles.contextTitle}>Linked prayer</div>
            <p className={styles.contextBody}>
              {story.story_text?.slice(0, 180) ||
                "Linked private prayer request."}
            </p>
            {(story.name || story.location) && (
              <p className={styles.privacyNote}>
                {story.name || "HTBF Community"}
                {story.location ? ` • ${story.location}` : ""}
              </p>
            )}
          </div>
        ) : null}

        <p className={styles.privacyNote}>
          Archive, mute, save, and report actions can be added when backend
          support is available.
        </p>
      </div>
    );
  }

  if (message) {
    const kind = getInboxMessageKind(message);
    const style = INBOX_CARD_STYLES[kind];

    return (
      <div>
        <h2 className={styles.contextTitle}>Message details</h2>

        <div className={styles.contextCard}>
          <div className={styles.contextTitle}>{style.label}</div>
          <p className={styles.contextBody}>{style.eyebrow}</p>
          <p className={styles.privacyNote}>
            {getExplicitCategoryLabel(message) || style.label}
          </p>
          <p className={styles.privacyNote}>
            Received {formatMessageDate(message.created_at)}
          </p>
        </div>

        {(message.story_id || message.prayer_request_id) && (
          <div className={styles.contextCard}>
            <div className={styles.contextTitle}>Linked content</div>
            <p className={styles.contextBody}>
              {message.prayer_request_id
                ? "Prayer request linked"
                : "Story linked"}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.placeholderPanel}>
      <p className={styles.placeholderBody}>Select a conversation to see details.</p>
    </div>
  );
}

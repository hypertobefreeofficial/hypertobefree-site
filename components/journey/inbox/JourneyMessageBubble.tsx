import type { InboxMessage } from "../../../lib/journey/inbox/types";
import { formatMessageDate } from "../../../lib/journey/inbox/utils";
import JourneyVideoMessage from "./JourneyVideoMessage";
import styles from "./JourneyInbox.module.css";

type JourneyMessageBubbleProps = {
  message: InboxMessage;
  mine: boolean;
};

export default function JourneyMessageBubble({
  message,
  mine,
}: JourneyMessageBubbleProps) {
  const videoUrl = message.video_url?.trim();

  return (
    <div
      className={`${styles.bubbleRow} ${
        mine ? styles.bubbleRowMine : styles.bubbleRowOther
      }`}
    >
      <article
        className={`${styles.bubble} ${
          mine ? styles.bubbleMine : styles.bubbleOther
        }`}
      >
        <div className={styles.bubbleMeta}>
          {mine ? "You" : "Prayer reply"} • {formatMessageDate(message.created_at)}
        </div>

        <p className={styles.bubbleText}>{message.body}</p>

        {videoUrl ? (
          <JourneyVideoMessage videoUrl={videoUrl} title={message.title} />
        ) : null}
      </article>
    </div>
  );
}

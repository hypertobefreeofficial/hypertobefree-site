import JourneyMessageBubble from "./JourneyMessageBubble";
import JourneyReplyComposer from "./JourneyReplyComposer";
import JourneyInboxHeader from "./JourneyInboxHeader";
import type {
  InboxMessage,
  InboxThread,
  PrayerStorySummary,
  ReplyMode,
} from "../../../lib/journey/inbox/types";
import {
  formatMessageDate,
  getInboxMessageKind,
  getThreadMessagesChronological,
  getThreadReplyTarget,
} from "../../../lib/journey/inbox/utils";
import { INBOX_CARD_STYLES } from "../../../lib/journey/inbox/constants";
import JourneyVideoMessage from "./JourneyVideoMessage";
import styles from "./JourneyInbox.module.css";

type JourneyConversationPanelProps = {
  mode: "empty" | "thread" | "notification";
  unreadCount: string;
  showMobileBack: boolean;
  onBack: () => void;
  thread?: InboxThread | null;
  message?: InboxMessage | null;
  story?: PrayerStorySummary;
  userId: string | null;
  onMarkRead: () => void;
  onClear: () => void;
  canReply: boolean;
  replyMode: ReplyMode;
  onReplyModeChange: (mode: ReplyMode) => void;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  replyVideoPreviewUrl: string;
  replyVideoDuration: number | null;
  replyStatus: string;
  sendingReply: boolean;
  onReplyVideoFile: (file: File | null) => void;
  onSendReply: () => void;
};

export default function JourneyConversationPanel({
  mode,
  unreadCount,
  showMobileBack,
  onBack,
  thread,
  message,
  story,
  userId,
  onMarkRead,
  onClear,
  canReply,
  replyMode,
  onReplyModeChange,
  replyText,
  onReplyTextChange,
  replyVideoPreviewUrl,
  replyVideoDuration,
  replyStatus,
  sendingReply,
  onReplyVideoFile,
  onSendReply,
}: JourneyConversationPanelProps) {
  if (mode === "empty") {
    return (
      <div className={styles.placeholderPanel}>
        <h2 className={styles.placeholderTitle}>Select a conversation</h2>
        <p className={styles.placeholderBody}>
          Choose a message or prayer thread from the list to read, respond, or
          manage it here.
        </p>
      </div>
    );
  }

  if (mode === "notification" && message) {
    const kind = getInboxMessageKind(message);
    const style = INBOX_CARD_STYLES[kind];
    const imageUrl = message.image_url?.trim();
    const videoUrl = message.video_url?.trim();
    const actionUrl = message.action_url?.trim();

    return (
      <>
        <JourneyInboxHeader
          unreadCount={unreadCount}
          showBackToList={showMobileBack}
          onBackToList={onBack}
          title={message.title}
          subtitle={style.eyebrow}
        />

        <div className={styles.messages}>
          <article className={styles.notificationDetail}>
            <div className={styles.typeBadge}>{style.label}</div>
            <h2 className={styles.notificationTitle}>{message.title}</h2>
            <time className={styles.rowTime} dateTime={message.created_at}>
              {formatMessageDate(message.created_at)}
            </time>

            {kind === "scripture_share" ? (
              <blockquote className={styles.notificationBody}>{message.body}</blockquote>
            ) : (
              <p className={styles.notificationBody}>{message.body}</p>
            )}

            {imageUrl ? (
              <img
                src={imageUrl}
                alt={message.title || "Journey Inbox image"}
                className="mt-4 max-h-80 w-full rounded-xl object-cover"
              />
            ) : null}

            {videoUrl ? <JourneyVideoMessage videoUrl={videoUrl} title={message.title} /> : null}

            <div className={styles.detailActions}>
              {!message.read ? (
                <button
                  type="button"
                  onClick={onMarkRead}
                  className={`${styles.primaryAction}`}
                >
                  Mark read
                </button>
              ) : null}

              {actionUrl ? (
                <a
                  href={actionUrl}
                  target={actionUrl.startsWith("/") ? undefined : "_blank"}
                  rel={actionUrl.startsWith("/") ? undefined : "noreferrer"}
                  className={styles.secondaryAction}
                >
                  View
                </a>
              ) : null}

              <button
                type="button"
                onClick={onClear}
                className={`${styles.secondaryAction} ${styles.toolbarButtonDanger}`}
              >
                Remove from my Inbox
              </button>
            </div>
          </article>
        </div>
      </>
    );
  }

  if (mode === "thread" && thread) {
    const chronologicalMessages = getThreadMessagesChronological(thread.messages);
    const replyTarget = getThreadReplyTarget(thread, userId);
    const showComposer = canReply && Boolean(replyTarget);

    return (
      <>
        <JourneyInboxHeader
          unreadCount={unreadCount}
          showBackToList={showMobileBack}
          onBackToList={onBack}
          title="Prayer Conversation"
          subtitle={`${thread.messages.length} message${
            thread.messages.length === 1 ? "" : "s"
          }`}
        />

        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>Private prayer thread</div>
          <p className={styles.panelSubtitle}>
            Replies stay private between you and the other participant.
          </p>
          <div className={styles.detailActions}>
            {thread.unreadCount > 0 ? (
              <button
                type="button"
                onClick={onMarkRead}
                className={styles.secondaryAction}
              >
                Mark conversation read
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClear}
              className={`${styles.secondaryAction} ${styles.toolbarButtonDanger}`}
            >
              Remove from my Inbox
            </button>
          </div>
        </div>

        <div className={styles.messages}>
          <section className={styles.contextCard} aria-label="Original prayer request">
            <div className={styles.contextTitle}>Original Prayer Request</div>
            {story?.story_text ? (
              <p className={styles.contextBody}>{story.story_text}</p>
            ) : (
              <p className={styles.contextBody}>
                This conversation is linked to a private prayer request.
              </p>
            )}
            {(story?.name || story?.location) && (
              <p className={styles.privacyNote}>
                {story.name || "HTBF Community"}
                {story.location ? ` • ${story.location}` : ""}
              </p>
            )}
          </section>

          {chronologicalMessages.map((threadMessage) => (
            <JourneyMessageBubble
              key={threadMessage.id}
              message={threadMessage}
              mine={Boolean(
                userId && threadMessage.sender_user_id === userId
              )}
            />
          ))}
        </div>

        {showComposer ? (
          <JourneyReplyComposer
            replyMode={replyMode}
            onReplyModeChange={onReplyModeChange}
            replyText={replyText}
            onReplyTextChange={onReplyTextChange}
            replyVideoPreviewUrl={replyVideoPreviewUrl}
            replyVideoDuration={replyVideoDuration}
            replyStatus={replyStatus}
            sendingReply={sendingReply}
            onReplyVideoFile={onReplyVideoFile}
            onSendReply={onSendReply}
          />
        ) : null}
      </>
    );
  }

  return null;
}

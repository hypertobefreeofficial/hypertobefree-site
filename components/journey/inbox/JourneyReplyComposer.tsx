import { Send, Video } from "lucide-react";
import type { ReplyMode } from "../../../lib/journey/inbox/types";
import { MAX_PRAYER_VIDEO_SECONDS } from "../../../lib/journey/inbox/constants";
import styles from "./JourneyInbox.module.css";

type JourneyReplyComposerProps = {
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

export default function JourneyReplyComposer({
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
}: JourneyReplyComposerProps) {
  return (
    <section className={styles.composer} aria-label="Reply composer">
      <div className={styles.composerModes}>
        <button
          type="button"
          onClick={() => onReplyModeChange("text")}
          className={`${styles.modeButton} ${
            replyMode === "text" ? styles.modeButtonActive : ""
          }`}
        >
          Text reply
        </button>
        <button
          type="button"
          onClick={() => onReplyModeChange("video")}
          className={`${styles.modeButton} ${
            replyMode === "video" ? styles.modeButtonActive : ""
          }`}
        >
          Video reply
        </button>
      </div>

      <label htmlFor="journey-inbox-reply-text" className="sr-only">
        Reply message
      </label>
      <textarea
        id="journey-inbox-reply-text"
        value={replyText}
        onChange={(event) => onReplyTextChange(event.target.value)}
        placeholder={
          replyMode === "video"
            ? "Optional message with your video..."
            : "Write a short private reply..."
        }
        className={styles.composerInput}
      />

      {replyMode === "video" ? (
        <>
          <label className={styles.videoPicker}>
            <Video className="h-5 w-5 text-[#0b63ce]" aria-hidden />
            <span className="text-sm font-black text-[#082f63]">
              Choose or record prayer video
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {MAX_PRAYER_VIDEO_SECONDS} seconds max
            </span>
            <input
              type="file"
              accept="video/*"
              capture="user"
              className="hidden"
              onChange={(event) =>
                onReplyVideoFile(event.target.files?.[0] ?? null)
              }
            />
          </label>

          {replyVideoPreviewUrl ? (
            <div className={styles.videoWrap}>
              <video
                src={replyVideoPreviewUrl}
                controls
                playsInline
                preload="metadata"
                className={styles.videoPlayer}
                aria-label="Video reply preview"
              />
            </div>
          ) : null}

          {replyVideoDuration !== null ? (
            <p className={styles.privacyNote}>
              Video length: {Math.round(replyVideoDuration)} seconds
            </p>
          ) : null}
        </>
      ) : null}

      {replyStatus ? <p className={styles.statusBanner}>{replyStatus}</p> : null}

      <div className={styles.composerActions}>
        <button
          type="button"
          onClick={onSendReply}
          disabled={sendingReply}
          className={styles.primaryAction}
        >
          <Send className="mr-1 inline h-4 w-4" aria-hidden />
          {sendingReply ? "Sending..." : "Send Reply"}
        </button>
      </div>

      <p className={styles.privacyNote}>
        Your reply is sent privately. It does not appear in public feeds.
      </p>
    </section>
  );
}

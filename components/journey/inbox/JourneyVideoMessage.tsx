import styles from "./JourneyInbox.module.css";

type JourneyVideoMessageProps = {
  videoUrl: string;
  title?: string;
};

export default function JourneyVideoMessage({
  videoUrl,
  title,
}: JourneyVideoMessageProps) {
  return (
    <div className={styles.videoWrap}>
      <video
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        className={styles.videoPlayer}
        aria-label={title ? `${title} video` : "Inbox video message"}
      />
      <p className={styles.privacyNote} style={{ padding: "0.5rem 0.75rem" }}>
        Private prayer videos are visible only within your Journey Inbox.
      </p>
    </div>
  );
}

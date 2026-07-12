import styles from "./JourneyInbox.module.css";

type JourneyInboxEmptyStateProps = {
  loading?: boolean;
};

export default function JourneyInboxEmptyState({
  loading = false,
}: JourneyInboxEmptyStateProps) {
  if (loading) {
    return (
      <div className={styles.loadingState} role="status">
        Loading messages...
      </div>
    );
  }

  return (
    <div className={styles.emptyState}>
      <h2 className={styles.emptyTitle}>No Journey Inbox messages yet</h2>
      <p className={styles.emptyBody}>
        Welcome messages, prayer updates, approval notices, milestones, and HTBF
        announcements will appear here.
      </p>
    </div>
  );
}

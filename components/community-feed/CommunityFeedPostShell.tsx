import type { CommunityFeedPostShellProps } from "./types";
import styles from "../FreedomFeed.module.css";

export default function CommunityFeedPostShell({
  id,
  className,
  header,
  body,
  media,
  status,
  actions,
  ownerSection,
}: CommunityFeedPostShellProps) {
  return (
    <article id={id} className={`${styles.post} ${className ?? ""}`.trim()}>
      {header}
      {body}
      {media}
      {status}
      {actions || ownerSection ? (
        <>
          <div className={styles.actionsDivider} aria-hidden />
          <div className={`${styles.postInset} ${styles.postActions}`}>
            {actions}
            {ownerSection}
          </div>
        </>
      ) : null}
    </article>
  );
}

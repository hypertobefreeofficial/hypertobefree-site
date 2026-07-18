import Link from "next/link";
import { Share2, Video } from "lucide-react";
import type { ReactNode } from "react";
import {
  isPrayerResponseContext,
  parentHrefForResponseContext,
} from "../../lib/responses/publicVideoResponseContext";
import CommunityFeedPostShell from "./CommunityFeedPostShell";
import CommunityFeedPostHeader from "./CommunityFeedPostHeader";
import { CommunityFeedResponseOverflowMenu } from "./CommunityFeedPostOverflowMenu";
import type {
  CommunityFeedPostCallbacks,
  FeedVideoResponseDisplay,
} from "./types";
import styles from "../FreedomFeed.module.css";

type VideoResponseFeedPostProps = {
  item: FeedVideoResponseDisplay;
  callbacks: CommunityFeedPostCallbacks;
  media: ReactNode;
  parentHref?: string;
};

export default function VideoResponseFeedPost({
  item,
  callbacks,
  media,
  parentHref,
}: VideoResponseFeedPostProps) {
  const menuOpen = callbacks.postOverflowMenuKey === item.dedupeKey;
  const parentExcerpt = item.parentStoryTitle
    ? item.parentStoryTitle.length > 72
      ? `${item.parentStoryTitle.slice(0, 72).trim()}…`
      : item.parentStoryTitle
    : null;
  const isPrayerParent = isPrayerResponseContext(item.parentResponseContext);
  const resolvedParentHref =
    parentHref ??
    (item.parentStoryId
      ? parentHrefForResponseContext(item.parentStoryId, item.parentResponseContext)
      : undefined);

  const header = (
    <CommunityFeedPostHeader
      avatarLabel={(item.name || "H").charAt(0).toUpperCase()}
      name={item.name || "HTBF Community"}
      meta={callbacks.formatAuthorMeta(item.location, item.created_at)}
      dedupeKey={item.dedupeKey}
      menuOpen={menuOpen}
      onToggleMenu={() =>
        callbacks.setPostOverflowMenuKey(menuOpen ? null : item.dedupeKey)
      }
      onCloseMenu={() => callbacks.setPostOverflowMenuKey(null)}
      menuTitle="Video options"
      menu={
        <CommunityFeedResponseOverflowMenu
          canReport={Boolean(
            callbacks.userId && item.user_id && item.user_id !== callbacks.userId
          )}
          onReport={() => callbacks.onReportVideoResponse(item)}
          canBlock={Boolean(item.user_id && item.user_id !== callbacks.userId)}
          blockPending={callbacks.pendingBlockUserId === item.user_id}
          onBlockUser={
            item.user_id
              ? () => void callbacks.onBlockFeedUser(item.user_id)
              : undefined
          }
        />
      }
    />
  );

  const body = (
    <div className={`${styles.postInset} ${styles.postBody}`}>
      <p className={styles.responseContext}>
        {isPrayerParent ? (
          <>
            Responded with a video prayer for{" "}
            {item.parentStoryAuthor ? (
              <span className="font-semibold text-slate-900">
                {item.parentStoryAuthor}&apos;s request
              </span>
            ) : (
              "this prayer request"
            )}
          </>
        ) : (
          <>
            Video response to{" "}
            {item.parentStoryAuthor ? (
              <span className="font-semibold text-slate-900">
                {item.parentStoryAuthor}&apos;s post
              </span>
            ) : (
              "this post"
            )}
          </>
        )}
      </p>

      {parentExcerpt ? (
        resolvedParentHref ? (
          <Link href={resolvedParentHref} className={styles.responseParentExcerpt}>
            &ldquo;{parentExcerpt}&rdquo;
          </Link>
        ) : (
          <p className={styles.responseParentExcerpt}>&ldquo;{parentExcerpt}&rdquo;</p>
        )
      ) : null}
    </div>
  );

  const actions = (
    <div className={styles.primaryActionRow}>
      {resolvedParentHref ? (
        <Link href={resolvedParentHref} className={styles.primaryActionButton}>
          <Video className="h-4 w-4 shrink-0" aria-hidden />
          <span className={styles.primaryActionLabelShort}>Video</span>
          <span className={styles.primaryActionLabelFull}>Video response</span>
        </Link>
      ) : (
        <span className={styles.primaryActionButton} aria-disabled="true">
          <Video className="h-4 w-4 shrink-0" aria-hidden />
          Video response
        </span>
      )}

      <button
        type="button"
        className={styles.primaryActionButton}
        onClick={() => callbacks.onShareVideoResponse(item)}
      >
        <Share2 className="h-4 w-4 shrink-0" aria-hidden />
        Share
      </button>
    </div>
  );

  return (
    <CommunityFeedPostShell
      id={`freedom-feed-response-${item.id}`}
      dedupeKey={item.dedupeKey}
      header={header}
      body={body}
      media={media}
      actions={actions}
    />
  );
}

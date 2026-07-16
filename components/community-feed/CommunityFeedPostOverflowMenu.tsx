import { EyeOff, Flag, UserX } from "lucide-react";
import type { FeedStoryDisplay } from "./types";
import styles from "../FreedomFeed.module.css";

type StoryOverflowProps = {
  story: FeedStoryDisplay;
  isOwner: boolean;
  onReport: () => void;
  onBlockUser?: () => void;
  onHide?: () => void;
  showHidePost?: boolean;
};

export function CommunityFeedStoryOverflowMenu({
  story,
  isOwner,
  onReport,
  onBlockUser,
  onHide,
  showHidePost = false,
}: StoryOverflowProps) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={styles.postOverflowItem}
        onClick={onReport}
      >
        <Flag className="h-4 w-4 shrink-0" aria-hidden />
        Report post
      </button>

      {!isOwner && story.user_id && onBlockUser ? (
        <button
          type="button"
          role="menuitem"
          className={`${styles.postOverflowItem} ${styles.postOverflowItemDanger}`}
          onClick={onBlockUser}
        >
          <UserX className="h-4 w-4 shrink-0" aria-hidden />
          Block user
        </button>
      ) : null}

      {showHidePost && onHide ? (
        <button
          type="button"
          role="menuitem"
          className={styles.postOverflowItem}
          onClick={onHide}
        >
          <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          Hide post
        </button>
      ) : null}
    </>
  );
}

type ResponseOverflowProps = {
  canBlock: boolean;
  onBlockUser?: () => void;
};

export function CommunityFeedResponseOverflowMenu({
  canBlock,
  onBlockUser,
}: ResponseOverflowProps) {
  return (
    <>
      {canBlock && onBlockUser ? (
        <button
          type="button"
          role="menuitem"
          className={`${styles.postOverflowItem} ${styles.postOverflowItemDanger}`}
          onClick={onBlockUser}
        >
          <UserX className="h-4 w-4 shrink-0" aria-hidden />
          Block user
        </button>
      ) : null}
    </>
  );
}

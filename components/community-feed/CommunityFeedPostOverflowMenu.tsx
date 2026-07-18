import { EyeOff, Flag, UserX } from "lucide-react";
import type { MouseEvent } from "react";
import type { FeedStoryDisplay } from "./types";
import styles from "../FreedomFeed.module.css";

type StoryOverflowProps = {
  story: FeedStoryDisplay;
  isOwner: boolean;
  onReport: () => void;
  onBlockUser?: () => void;
  onHide?: () => void;
  showHidePost?: boolean;
  blockPending?: boolean;
};

function stopMenuEvent(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

export function CommunityFeedStoryOverflowMenu({
  story,
  isOwner,
  onReport,
  onBlockUser,
  onHide,
  showHidePost = false,
  blockPending = false,
}: StoryOverflowProps) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={styles.postOverflowItem}
        onClick={(event) => {
          stopMenuEvent(event);
          onReport();
        }}
      >
        <Flag className="h-4 w-4 shrink-0" aria-hidden />
        Report post
      </button>

      {!isOwner && story.user_id && onBlockUser ? (
        <button
          type="button"
          role="menuitem"
          className={`${styles.postOverflowItem} ${styles.postOverflowItemDanger}`}
          disabled={blockPending}
          aria-busy={blockPending || undefined}
          onClick={(event) => {
            stopMenuEvent(event);
            onBlockUser();
          }}
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
          onClick={(event) => {
            stopMenuEvent(event);
            onHide();
          }}
        >
          <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          Hide post
        </button>
      ) : null}
    </>
  );
}

type ResponseOverflowProps = {
  canReport: boolean;
  onReport?: () => void;
  canBlock: boolean;
  onBlockUser?: () => void;
  blockPending?: boolean;
};

export function CommunityFeedResponseOverflowMenu({
  canReport,
  onReport,
  canBlock,
  onBlockUser,
  blockPending = false,
}: ResponseOverflowProps) {
  return (
    <>
      {canReport && onReport ? (
        <button
          type="button"
          role="menuitem"
          className={styles.postOverflowItem}
          onClick={(event) => {
            event.stopPropagation();
            onReport();
          }}
        >
          <Flag className="h-4 w-4 shrink-0" aria-hidden />
          Report video
        </button>
      ) : null}

      {canBlock && onBlockUser ? (
        <button
          type="button"
          role="menuitem"
          className={`${styles.postOverflowItem} ${styles.postOverflowItemDanger}`}
          disabled={blockPending}
          aria-busy={blockPending || undefined}
          onClick={(event) => {
            event.stopPropagation();
            onBlockUser();
          }}
        >
          <UserX className="h-4 w-4 shrink-0" aria-hidden />
          Block user
        </button>
      ) : null}
    </>
  );
}

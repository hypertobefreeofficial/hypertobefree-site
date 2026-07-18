"use client";

import { useRef } from "react";
import { MoreVertical } from "lucide-react";
import CommunityFeedPostOverflowPortal from "./CommunityFeedPostOverflowPortal";
import styles from "../FreedomFeed.module.css";

type CommunityFeedPostHeaderProps = {
  avatarLabel: string;
  name: string;
  meta: string;
  badge?: React.ReactNode;
  dedupeKey: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  menuTitle?: string;
  menu: React.ReactNode;
};

export default function CommunityFeedPostHeader({
  avatarLabel,
  name,
  meta,
  badge,
  dedupeKey,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  menuTitle = "Post options",
  menu,
}: CommunityFeedPostHeaderProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `feed-post-menu-${dedupeKey}`;

  return (
    <div className={`${styles.postInset} ${styles.postHeader}`}>
      <div className={styles.postHeaderRow}>
        <div className={styles.authorRow}>
          <div className={styles.avatar}>{avatarLabel}</div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className={styles.authorName}>{name}</div>
              {badge}
            </div>
            <div className={styles.authorMeta}>{meta}</div>
          </div>
        </div>

        <div
          className={styles.postHeaderActions}
          data-feed-post-overflow-root="true"
        >
          <button
            ref={triggerRef}
            type="button"
            className={styles.overflowTrigger}
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu();
            }}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>

          <CommunityFeedPostOverflowPortal
            open={menuOpen}
            title={menuTitle}
            menuId={menuId}
            triggerRef={triggerRef}
            onClose={onCloseMenu}
          >
            {menu}
          </CommunityFeedPostOverflowPortal>
        </div>
      </div>
    </div>
  );
}

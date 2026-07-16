import { MoreVertical } from "lucide-react";
import styles from "../FreedomFeed.module.css";

type CommunityFeedPostHeaderProps = {
  avatarLabel: string;
  name: string;
  meta: string;
  badge?: React.ReactNode;
  dedupeKey: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
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
  menu,
}: CommunityFeedPostHeaderProps) {
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
            type="button"
            className={styles.overflowTrigger}
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={`feed-post-menu-${dedupeKey}`}
            onClick={onToggleMenu}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              id={`feed-post-menu-${dedupeKey}`}
              className={styles.postOverflowMenu}
              role="menu"
            >
              {menu}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

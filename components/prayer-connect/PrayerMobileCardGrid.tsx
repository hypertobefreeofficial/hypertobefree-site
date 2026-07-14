"use client";

import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import PrayerConnectCard from "./PrayerConnectCard";
import { type PrayerActionItem } from "./PrayerActionMenu";
import styles from "./PrayerConnect.module.css";

type PrayerMobileCardGridProps = {
  requests: PrayerConnectRequest[];
  layout: "grid" | "list";
  selectedId: string | null;
  savedIds: string[];
  onOpen: (id: string) => void;
  onToggleSave: (id: string) => void;
  buildMenuItems?: (request: PrayerConnectRequest) => PrayerActionItem[];
  hasMore: boolean;
  remainingCount: number;
  onLoadMore: () => void;
};

export default function PrayerMobileCardGrid({
  requests,
  layout,
  selectedId,
  savedIds,
  onOpen,
  onToggleSave,
  buildMenuItems,
  hasMore,
  remainingCount,
  onLoadMore,
}: PrayerMobileCardGridProps) {
  return (
    <>
      <div
        className={`${styles.mobileCardGrid} ${
          layout === "list" ? styles.mobileCardList : ""
        }`}
      >
        {requests.map((request) => (
          <PrayerConnectCard
            key={request.id}
            request={request}
            selected={selectedId === request.id}
            saved={savedIds.includes(request.id)}
            onOpen={() => onOpen(request.id)}
            onToggleSave={() => onToggleSave(request.id)}
            menuItems={buildMenuItems?.(request)}
          />
        ))}
      </div>
      {hasMore ? (
        <div className={styles.loadMoreRow}>
          <button
            type="button"
            className={styles.loadMoreButton}
            onClick={onLoadMore}
          >
            Show more prayer requests
            <span className={styles.loadMoreMeta}>{remainingCount} more</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

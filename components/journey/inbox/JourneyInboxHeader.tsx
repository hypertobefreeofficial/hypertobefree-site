"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { InboxFilter } from "../../../lib/journey/inbox/types";
import JourneyInboxFilters from "./JourneyInboxFilters";
import styles from "./JourneyInbox.module.css";

type JourneyInboxHeaderProps = {
  unreadCount: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeFilter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  onMarkVisibleRead: () => void;
  onClearVisible: () => void;
  markingAllRead: boolean;
  canMarkVisibleRead: boolean;
  canClearVisible: boolean;
  itemCount: number;
};

export default function JourneyInboxHeader({
  unreadCount,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  onMarkVisibleRead,
  onClearVisible,
  markingAllRead,
  canMarkVisibleRead,
  canClearVisible,
  itemCount,
}: JourneyInboxHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className={styles.workspaceHeaderInner}>
      <div className={styles.workspaceHeaderTop}>
        <Link href="/journey" className={styles.backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Journey
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>Hyper To Be Free</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Journey Inbox</h1>
            <span className={styles.unreadPill}>{unreadCount} unread</span>
          </div>
          <p className={styles.subtitle}>
            Messages, prayer responses, video replies, updates, and milestones
            from your HTBF journey.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.headerSearchDesktop}>
            <label htmlFor="journey-inbox-search-desktop" className="sr-only">
              Search messages
            </label>
            <input
              id="journey-inbox-search-desktop"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search messages..."
              className={styles.searchInput}
            />
          </div>

          <button
            type="button"
            onClick={onMarkVisibleRead}
            disabled={!canMarkVisibleRead || markingAllRead}
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
          >
            {markingAllRead ? "Marking..." : "Mark all read"}
          </button>

          <div className={styles.overflowMenu} ref={menuRef}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Inbox actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>

            {menuOpen ? (
              <div className={styles.overflowMenuPanel} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canClearVisible}
                  className={styles.overflowMenuItemDanger}
                  onClick={() => {
                    setMenuOpen(false);
                    onClearVisible();
                  }}
                >
                  Remove visible messages
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.headerSearchMobile}>
        <label htmlFor="journey-inbox-search-mobile" className="sr-only">
          Search messages
        </label>
        <input
          id="journey-inbox-search-mobile"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search messages..."
          className={styles.searchInput}
        />
      </div>

      <JourneyInboxFilters
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />

      <div className={styles.listToolbar}>
        <span className={styles.subtitle}>
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          onClick={onMarkVisibleRead}
          disabled={!canMarkVisibleRead || markingAllRead}
          className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary} ${styles.markReadMobile}`}
        >
          {markingAllRead ? "Marking..." : "Mark all read"}
        </button>
      </div>
    </header>
  );
}

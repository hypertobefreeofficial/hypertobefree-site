"use client";

import { Menu, MoreHorizontal, Search } from "lucide-react";
import styles from "./PrayerConnect.module.css";

type PrayerMobileHeaderProps = {
  onOpenMenu: () => void;
  onToggleSearch: () => void;
  onOpenOverflow: () => void;
  searchActive: boolean;
};

export default function PrayerMobileHeader({
  onOpenMenu,
  onToggleSearch,
  onOpenOverflow,
  searchActive,
}: PrayerMobileHeaderProps) {
  return (
    <header className={styles.mobileHeader}>
      <div className={styles.mobileHeaderRow}>
        <button
          type="button"
          className={styles.mobileHeaderIcon}
          aria-label="Open Prayer menu"
          onClick={onOpenMenu}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <h1 className={styles.mobileHeaderTitle}>Prayer</h1>

        <div className={styles.mobileHeaderActions}>
          <button
            type="button"
            className={styles.mobileHeaderIcon}
            aria-label="Search prayers"
            aria-expanded={searchActive}
            onClick={onToggleSearch}
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.mobileHeaderIcon}
            aria-label="More prayer options"
            aria-haspopup="menu"
            onClick={onOpenOverflow}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <p className={styles.mobileHeaderSlogan}>
        Find someone to pray for. Share what you are facing. Pray without
        borders.
      </p>
    </header>
  );
}

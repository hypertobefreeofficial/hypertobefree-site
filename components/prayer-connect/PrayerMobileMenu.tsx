"use client";

import {
  Bookmark,
  CheckCircle2,
  Compass,
  Heart,
  MapPin,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import type { PrayerViewTab } from "./PrayerSectionNav";
import PrayerMobileSheet from "./PrayerMobileSheet";
import styles from "./PrayerConnect.module.css";

type PrayerMobileMenuProps = {
  open: boolean;
  onClose: () => void;
  activeTab: PrayerViewTab;
  mapActive: boolean;
  onSelectTab: (tab: PrayerViewTab) => void;
  onOpenMap: () => void;
  onPost: () => void;
};

const TABS: { id: PrayerViewTab; label: string; icon: typeof Compass }[] = [
  { id: "discover", label: "Discover", icon: Compass },
  { id: "following", label: "Following", icon: Heart },
  { id: "my-requests", label: "My Requests", icon: UserRound },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "answered", label: "Answered", icon: CheckCircle2 },
];

export default function PrayerMobileMenu({
  open,
  onClose,
  activeTab,
  mapActive,
  onSelectTab,
  onOpenMap,
  onPost,
}: PrayerMobileMenuProps) {
  return (
    <PrayerMobileSheet
      open={open}
      onClose={onClose}
      side="left"
      labelledBy="mobile-menu-title"
    >
      <div className={styles.mobileMenuHeader}>
        <span id="mobile-menu-title" className={styles.mobileMenuTitle}>
          Prayer <span className={styles.mobileMenuTitleSub}>Connect</span>
        </span>
        <button
          type="button"
          className={styles.mobileHeaderIcon}
          aria-label="Close menu"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav className={styles.mobileMenuNav} aria-label="Prayer sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          const isActive = !mapActive && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              className={`${styles.mobileMenuItem} ${
                isActive ? styles.mobileMenuItemActive : ""
              }`}
              onClick={() => {
                onSelectTab(item.id);
                onClose();
              }}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </button>
          );
        })}

        <button
          type="button"
          aria-current={mapActive ? "page" : undefined}
          className={`${styles.mobileMenuItem} ${
            mapActive ? styles.mobileMenuItemActive : ""
          }`}
          onClick={() => {
            onOpenMap();
            onClose();
          }}
        >
          <MapPin className="h-5 w-5" aria-hidden />
          Prayer Map
        </button>
      </nav>

      <button
        type="button"
        className={styles.mobileMenuPost}
        onClick={() => {
          onPost();
          onClose();
        }}
      >
        <Plus className="h-5 w-5" aria-hidden />
        Post a Prayer
      </button>
    </PrayerMobileSheet>
  );
}

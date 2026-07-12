"use client";

import styles from "./PrayerConnect.module.css";

export type PrayerViewTab =
  | "discover"
  | "following"
  | "my-requests"
  | "saved"
  | "answered";

const ITEMS: { id: PrayerViewTab; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "following", label: "Following" },
  { id: "my-requests", label: "My Requests" },
  { id: "saved", label: "Saved" },
  { id: "answered", label: "Answered" },
];

type PrayerSectionNavProps = {
  active: PrayerViewTab;
  onChange: (tab: PrayerViewTab) => void;
};

export default function PrayerSectionNav({
  active,
  onChange,
}: PrayerSectionNavProps) {
  return (
    <nav className={styles.sectionNav} aria-label="Prayer views">
      <div className={styles.sectionNavInner} role="tablist">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.sectionNavLink} ${
                isActive ? styles.sectionNavLinkActive : ""
              }`}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

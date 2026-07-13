"use client";

import Image from "next/image";
import { CircleHelp, Plus } from "lucide-react";
import PrayerSectionNav, { type PrayerViewTab } from "./PrayerSectionNav";
import styles from "./PrayerConnect.module.css";

type PrayerExperienceHeaderProps = {
  activeTab: PrayerViewTab;
  onTabChange: (tab: PrayerViewTab) => void;
  onPost: () => void;
  onHowItWorks: () => void;
  compact?: boolean;
};

export default function PrayerExperienceHeader({
  activeTab,
  onTabChange,
  onPost,
  onHowItWorks,
  compact = false,
}: PrayerExperienceHeaderProps) {
  return (
    <section
      className={`${styles.prayerHero} ${compact ? styles.prayerHeroCompact : ""}`}
      aria-labelledby="prayer-page-title"
    >
      <div className={styles.prayerHeroBackdrop} aria-hidden>
        <picture>
          <source
            media="(min-width: 768px)"
            srcSet="/images/prayer/prayer-global-hero.png"
          />
          <Image
            src="/images/prayer/prayer-global-hero.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1280px) 720px, (min-width: 768px) 55vw, 100vw"
            className={styles.prayerHeroImage}
          />
        </picture>
        <div className={styles.prayerHeroGlow} />
      </div>

      <div className={styles.prayerHeroContent}>
        <div className={styles.prayerHeroTopRow}>
          <div className={styles.prayerHeroCopy}>
            <h1 id="prayer-page-title" className={styles.prayerHeroTitle}>
              Prayer
            </h1>
            <span className={styles.prayerHeroAccent} aria-hidden />
            <p className={styles.prayerHeroSubtitle}>
              Find someone to pray for. Share what you are facing. Pray without
              borders.
            </p>
          </div>

          <div className={styles.prayerHeroActions}>
            <button
              type="button"
              className={styles.prayerHeroHelp}
              onClick={onHowItWorks}
            >
              <CircleHelp className="h-4 w-4" aria-hidden />
              <span>How It Works</span>
            </button>
            <button
              type="button"
              className={styles.prayerHeroPost}
              onClick={onPost}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Post a Prayer Request
            </button>
          </div>
        </div>

        <PrayerSectionNav active={activeTab} onChange={onTabChange} />
      </div>
    </section>
  );
}

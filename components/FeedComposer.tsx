"use client";

import Link from "next/link";
import {
  MessageCircleHeart,
  Plus,
  Sparkles,
  Video,
} from "lucide-react";
import {
  FeedComposerHeroMotion,
  FEED_COMPOSER_HERO_SRC,
} from "./FeedComposerHeroMotion";
import styles from "./FeedComposer.module.css";

export { FEED_COMPOSER_HERO_SRC };

export function FeedComposer() {
  return (
    <div className={styles.card}>
      <div aria-hidden className={styles.bg}>
        <div className={styles.imageWrap}>
          <FeedComposerHeroMotion />
        </div>
        <div className={styles.readabilityEdge} />
      </div>

      <div className={styles.content}>
        <div className={styles.copyBlock}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowIcon}>
              <Sparkles className="h-2.5 w-2.5 text-[#9a7b1a]" aria-hidden />
            </span>
            <span className={styles.eyebrowText}>Share what God has done</span>
          </div>

          <Link href="/share-your-story" className={styles.headlineLink}>
            <span className={styles.headline}>
              What has <em className={styles.headlineEm}>God</em> done?
            </span>
            <span className={styles.support}>
              Share a testimony, video, or prayer request.
            </span>
          </Link>

          <div className={styles.actions}>
            <Link
              href="/share-your-story"
              className={`${styles.action} ${styles.actionStory}`}
            >
              <span aria-hidden className={styles.actionStoryGlow} />
              <Plus className="relative h-4 w-4 shrink-0" />
              <span className="relative">Story</span>
            </Link>

            <Link
              href="/videos"
              className={`${styles.action} ${styles.actionVideos}`}
            >
              <Video className="h-4 w-4 shrink-0 text-[#0b63ce]" />
              <span>Videos</span>
            </Link>

            <Link
              href="/prayer"
              className={`${styles.action} ${styles.actionPrayer}`}
            >
              <MessageCircleHeart className="h-4 w-4 shrink-0 text-[#b8860b]" />
              <span>Prayer</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

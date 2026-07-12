import Image from "next/image";
import Link from "next/link";
import { Play, Send, Trophy } from "lucide-react";
import { JOURNEY_IMAGES } from "../../lib/journey/assets";
import styles from "./JourneyDashboard.module.css";

export default function JourneyKeepGoingCard() {
  return (
    <section
      className={styles.keepGoing}
      aria-labelledby="journey-keep-going-title"
    >
      <Image
        src={JOURNEY_IMAGES.keepGoingDesktop}
        alt=""
        fill
        sizes="(max-width: 767px) 0px, 76rem"
        className={`${styles.keepGoingImage} hidden md:block`}
      />
      <Image
        src={JOURNEY_IMAGES.keepGoingMobile}
        alt=""
        fill
        sizes="(max-width: 767px) 100vw, 0px"
        className={`${styles.keepGoingImage} md:hidden`}
      />

      <div className={styles.keepGoingReadability} aria-hidden />

      <div className={styles.keepGoingContent}>
        <div className={styles.heroEyebrow}>
          <Trophy className="h-4 w-4" aria-hidden />
          Keep Going
        </div>

        <h2 id="journey-keep-going-title" className={styles.heroTitle}>
          One story can strengthen another person&apos;s journey.
        </h2>

        <p className={styles.heroBody}>
          Share what God did, stand with someone in prayer, or encourage someone
          through your story.
        </p>

        <div className={styles.keepGoingActions}>
          <Link href="/share-your-story" className={styles.primaryButton}>
            Share What God Did
            <Send className="ml-2 h-4 w-4" aria-hidden />
          </Link>

          <Link href="/video-feed" className={styles.secondaryButton}>
            Watch Testimonies
            <Play className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

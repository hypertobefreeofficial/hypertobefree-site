import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { JOURNEY_IMAGES } from "../../lib/journey/assets";
import styles from "./JourneyDashboard.module.css";

export default function JourneyHero() {
  return (
    <section className={styles.hero} aria-labelledby="journey-hero-title">
      <Image
        src={JOURNEY_IMAGES.heroDesktop}
        alt=""
        fill
        priority
        sizes="(max-width: 767px) 0px, 76rem"
        className={`${styles.heroImage} hidden md:block`}
      />
      <Image
        src={JOURNEY_IMAGES.heroMobile}
        alt=""
        fill
        priority
        sizes="(max-width: 767px) 100vw, 0px"
        className={`${styles.heroImage} md:hidden`}
      />

      <div className={styles.heroReadability} aria-hidden />

      <div className={styles.heroContent}>
        <div className={styles.heroEyebrow}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Freedom Journey
        </div>

        <span className={styles.heroBadge}>Your Journey</span>

        <h1 id="journey-hero-title" className={styles.heroTitle}>
          This is your role in the movement.
        </h1>

        <p className={styles.heroBody}>
          Track your impact through prayer, encouragement, answered prayers,
          reflection, and the stories you have shared.
        </p>

        <Link href="/share-your-story" className={styles.heroCta}>
          Share Something
        </Link>
      </div>
    </section>
  );
}

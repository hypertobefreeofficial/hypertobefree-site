import Image from "next/image";
import Link from "next/link";
import { Map } from "lucide-react";
import { JOURNEY_IMAGES } from "../../lib/journey/assets";
import styles from "./JourneyDashboard.module.css";

export default function JourneyMapFeature() {
  return (
    <section className={styles.mapFeature} aria-labelledby="journey-map-title">
      <Image
        src={JOURNEY_IMAGES.mapDesktop}
        alt=""
        fill
        sizes="(max-width: 767px) 0px, 76rem"
        className={`${styles.mapFeatureImage} hidden md:block`}
      />
      <Image
        src={JOURNEY_IMAGES.mapMobile}
        alt=""
        fill
        sizes="(max-width: 767px) 100vw, 0px"
        className={`${styles.mapFeatureImage} md:hidden`}
      />

      <div className={styles.mapFeatureOverlay} aria-hidden />

      <div className={styles.mapFeatureContent}>
        <div className={styles.heroEyebrow}>
          <Map className="h-4 w-4" aria-hidden />
          Testimony Map
        </div>

        <h2 id="journey-map-title" className={styles.heroTitle}>
          Explore stories of faith, freedom, prayer, and praise from around the
          world.
        </h2>

        <p className={styles.heroBody}>
          See approved HTBF stories by approximate public location and discover
          what God is doing across cities and nations.
        </p>

        <Link href="/journey/map" className={styles.heroCta}>
          Explore the Map
        </Link>
      </div>
    </section>
  );
}

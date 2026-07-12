import Image from "next/image";
import { NotebookPen } from "lucide-react";
import { JOURNEY_IMAGES } from "../../lib/journey/assets";
import styles from "./JourneyDashboard.module.css";

type JourneyReflectionCardProps = {
  reflection: string;
  onReflectionChange: (value: string) => void;
};

export default function JourneyReflectionCard({
  reflection,
  onReflectionChange,
}: JourneyReflectionCardProps) {
  return (
    <section
      id="journey-reflection-room"
      className={styles.reflectionCard}
      aria-labelledby="journey-reflection-title"
    >
      <div className={styles.reflectionGrid}>
        <div className={styles.reflectionVisual}>
          <Image
            src={JOURNEY_IMAGES.reflectionDesktop}
            alt=""
            fill
            sizes="(max-width: 767px) 0px, 40rem"
            className={`${styles.reflectionImage} hidden md:block`}
          />
          <Image
            src={JOURNEY_IMAGES.reflectionMobile}
            alt=""
            fill
            sizes="(max-width: 767px) 100vw, 0px"
            className={`${styles.reflectionImage} md:hidden`}
          />
        </div>

        <div className={styles.reflectionForm}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <NotebookPen className="h-6 w-6" aria-hidden />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Reflection Room
              </div>
              <h2 id="journey-reflection-title" className={styles.sectionTitle}>
                What do you want to remember?
              </h2>
            </div>
          </div>

          <p className={styles.sectionBody}>
            Write a private reflection, prayer note, or testimony reminder. It
            stays saved on this device.
          </p>

          <label htmlFor="journey-reflection-textarea" className="sr-only">
            Private reflection
          </label>

          <textarea
            id="journey-reflection-textarea"
            value={reflection}
            onChange={(event) => onReflectionChange(event.target.value)}
            placeholder="Write a private reflection, prayer note, or testimony reminder..."
            className={`${styles.reflectionTextarea} mt-4`}
          />

          <p className="mt-3 text-sm font-semibold text-slate-500">
            Saved on this device.
          </p>
        </div>
      </div>
    </section>
  );
}

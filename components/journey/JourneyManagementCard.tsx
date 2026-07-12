import { ChevronRight, Compass } from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type JourneyManagementCardProps = {
  onOpenControlCenter: () => void;
  uploadCount: number;
};

export default function JourneyManagementCard({
  onOpenControlCenter,
  uploadCount,
}: JourneyManagementCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenControlCenter}
      className={styles.manageCard}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <Compass className="h-6 w-6" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
          Manage Your Journey
        </div>
        <h2 className={styles.sectionTitle}>My uploads</h2>
        <p className={styles.sectionBody}>
          Open your content command center to organize, preview, edit, and manage
          what you have shared on HTBF.
          {uploadCount > 0 ? ` ${uploadCount} upload${uploadCount === 1 ? "" : "s"} ready.` : ""}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./JourneyDashboard.module.css";

export default function JourneyHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/feed" className={styles.headerBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Feed
        </Link>

        <div className={styles.headerTitle}>Journey</div>
      </div>
    </header>
  );
}

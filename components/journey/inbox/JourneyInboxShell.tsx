import type { ReactNode } from "react";
import styles from "./JourneyInbox.module.css";

type JourneyInboxShellProps = {
  listPane: ReactNode;
  detailPane: ReactNode;
  contextPane?: ReactNode;
  showMobileDetail: boolean;
  statusMessage?: string;
};

export default function JourneyInboxShell({
  listPane,
  detailPane,
  contextPane,
  showMobileDetail,
  statusMessage,
}: JourneyInboxShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {statusMessage ? (
          <div className={styles.statusBanner}>{statusMessage}</div>
        ) : null}

        <div className={styles.workspace}>
          <div
            className={`${styles.listPane} ${
              showMobileDetail ? styles.listPaneHiddenMobile : ""
            }`}
          >
            {listPane}
          </div>

          <div
            className={`${styles.detailPane} ${
              showMobileDetail ? styles.detailPaneActiveMobile : ""
            }`}
          >
            {detailPane}
          </div>

          {contextPane ? (
            <aside className={styles.contextPaneVisible}>{contextPane}</aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}

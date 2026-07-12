import type { ReactNode } from "react";
import styles from "./JourneyInbox.module.css";

type JourneyInboxShellProps = {
  workspaceHeader: ReactNode;
  listPane: ReactNode;
  detailPane: ReactNode;
  contextPane?: ReactNode;
  showMobileDetail: boolean;
  statusMessage?: string;
  hideBottomNavPadding?: boolean;
};

export default function JourneyInboxShell({
  workspaceHeader,
  listPane,
  detailPane,
  contextPane,
  showMobileDetail,
  statusMessage,
  hideBottomNavPadding = false,
}: JourneyInboxShellProps) {
  return (
    <main
      className={`${styles.page} ${
        hideBottomNavPadding ? styles.pageDesktopNoNav : ""
      }`}
    >
      <div className={styles.shell}>
        {statusMessage ? (
          <div className={styles.statusBanner}>{statusMessage}</div>
        ) : null}

        <div className={styles.workspace}>
          <div
            className={`${styles.workspaceHeader} ${
              showMobileDetail ? styles.workspaceHeaderHiddenMobile : ""
            }`}
          >
            {workspaceHeader}
          </div>

          <div
            className={`${styles.workspaceBody} ${
              showMobileDetail ? styles.workspaceBodyDetailMobile : ""
            }`}
          >
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
              <div className={styles.detailSurface}>{detailPane}</div>
            </div>

            {contextPane ? (
              <aside className={`${styles.contextPane} ${styles.contextPaneVisible}`}>
                {contextPane}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

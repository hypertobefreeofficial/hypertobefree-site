"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  MoreHorizontal,
  NotebookPen,
  Play,
  Trash2,
} from "lucide-react";
import type { JourneyUpload } from "../../../lib/journey/uploads/types";
import {
  getPublicViewHref,
  getUploadStatus,
} from "../../../lib/journey/uploads/utils";
import { getUploadVideoSource } from "../../../lib/journey/uploads/media";
import styles from "./JourneyUploads.module.css";

const MOBILE_BREAKPOINT = 1099;

type JourneyUploadActionsMenuProps = {
  upload: JourneyUpload;
  removing: boolean;
  deleting: boolean;
  onPlayVideo?: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
};

export default function JourneyUploadActionsMenu({
  upload,
  removing,
  deleting,
  onPlayVideo,
  onViewDetails,
  onEdit,
  onRemove,
  onDeleteForever,
}: JourneyUploadActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 240 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const titleId = useId();
  const status = getUploadStatus(upload);
  const publicHref = getPublicViewHref(upload);
  const hasVideo = Boolean(getUploadVideoSource(upload));

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    function sync() {
      setIsMobile(window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches);
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const updateDesktopPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(280, window.innerWidth - 16);
    const estimatedHeight = 280;
    let left = rect.right - menuWidth;
    let top = rect.bottom + 8;

    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 8);
    }

    setCoords({ top, left, width: menuWidth });
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobile) return;
    updateDesktopPosition();
  }, [open, isMobile, updateDesktopPosition]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    }

    function onScroll() {
      if (isMobile) return;
      const trigger = triggerRef.current;
      if (!trigger) {
        close();
        return;
      }
      const rect = trigger.getBoundingClientRect();
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        close();
        return;
      }
      updateDesktopPosition();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    const previousOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (isMobile) document.body.style.overflow = previousOverflow;
    };
  }, [open, isMobile, close, updateDesktopPosition]);

  function run(action: () => void) {
    close();
    action();
  }

  const actions = (
    <>
      {hasVideo && onPlayVideo ? (
        <MenuButton
          onClick={() =>
            run(() => {
              onPlayVideo();
            })
          }
        >
          <Play className="mr-1 inline h-4 w-4" aria-hidden />
          Play Video
        </MenuButton>
      ) : null}

      <MenuButton onClick={() => run(onViewDetails)}>
        <Eye className="mr-1 inline h-4 w-4" aria-hidden />
        View Details
      </MenuButton>

      {status !== "removed" && publicHref ? (
        <a
          href={publicHref}
          className={styles.menuItem}
          role="menuitem"
          onClick={() => close()}
        >
          View Public Post
        </a>
      ) : null}

      {status !== "removed" ? (
        <>
          <MenuButton onClick={() => run(onEdit)}>
            <NotebookPen className="mr-1 inline h-4 w-4" aria-hidden />
            Edit Upload
          </MenuButton>
          <MenuButton
            danger
            disabled={removing}
            onClick={() => run(onRemove)}
          >
            <Trash2 className="mr-1 inline h-4 w-4" aria-hidden />
            {removing ? "Removing..." : "Remove from Public View"}
          </MenuButton>
        </>
      ) : (
        <div className={styles.menuDangerZone}>
          <MenuButton
            danger
            disabled={deleting}
            onClick={() => run(onDeleteForever)}
          >
            <Trash2 className="mr-1 inline h-4 w-4" aria-hidden />
            {deleting ? "Deleting..." : "Delete Forever"}
          </MenuButton>
        </div>
      )}
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.iconButton}
        aria-label="Upload actions"
        aria-haspopup={isMobile ? "dialog" : "menu"}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            isMobile ? (
              <div className={styles.sheetOverlay} onClick={close}>
                <div
                  ref={menuRef}
                  id={menuId}
                  className={styles.actionSheet}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.sheetHandle} aria-hidden />
                  <h2 id={titleId} className={styles.sheetTitle}>
                    Upload actions
                  </h2>
                  <div className={styles.sheetActions}>{actions}</div>
                  <button
                    type="button"
                    className={styles.sheetCancel}
                    onClick={close}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                ref={menuRef}
                id={menuId}
                className={styles.menuPanelFixed}
                role="menu"
                aria-label="Upload actions"
                style={{
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                }}
              >
                {actions}
              </div>
            ),
            document.body
          )
        : null}
    </>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={danger ? styles.menuItemDanger : styles.menuItem}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

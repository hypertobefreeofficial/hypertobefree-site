"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Eye, NotebookPen, Trash2 } from "lucide-react";
import type { JourneyUpload } from "../../../lib/journey/uploads/types";
import { getPublicViewHref, getUploadStatus } from "../../../lib/journey/uploads/utils";
import styles from "./JourneyUploads.module.css";

type JourneyUploadActionsMenuProps = {
  upload: JourneyUpload;
  removing: boolean;
  deleting: boolean;
  onViewDetails: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
};

export default function JourneyUploadActionsMenu({
  upload,
  removing,
  deleting,
  onViewDetails,
  onEdit,
  onRemove,
  onDeleteForever,
}: JourneyUploadActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const status = getUploadStatus(upload);
  const publicHref = getPublicViewHref(upload);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Upload actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div className={styles.menuPanel} role="menu" id={menuId}>
          <MenuButton
            onClick={() => {
              setOpen(false);
              onViewDetails();
            }}
          >
            View Details
          </MenuButton>

          {publicHref ? (
            <a
              href={publicHref}
              className={styles.menuItem}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              View Public Post
            </a>
          ) : null}

          {status !== "removed" ? (
            <>
              <MenuButton
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <NotebookPen className="mr-1 inline h-4 w-4" aria-hidden />
                Edit Upload
              </MenuButton>
              <MenuButton
                danger
                disabled={removing}
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                <Trash2 className="mr-1 inline h-4 w-4" aria-hidden />
                {removing ? "Removing..." : "Remove from Public View"}
              </MenuButton>
            </>
          ) : (
            <MenuButton
              danger
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                onDeleteForever();
              }}
            >
              <Trash2 className="mr-1 inline h-4 w-4" aria-hidden />
              {deleting ? "Deleting..." : "Delete Forever"}
            </MenuButton>
          )}
        </div>
      ) : null}
    </div>
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

export function ViewActionButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.secondaryButton}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Eye className="h-4 w-4" aria-hidden />
      View
    </button>
  );
}

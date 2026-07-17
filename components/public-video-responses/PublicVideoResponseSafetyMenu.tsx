"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, MoreHorizontal, Trash2, UserMinus, UserX } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { removePrayerVideoResponse } from "../../lib/prayer-connect/communityResponses";
import { submitContentReport } from "../../lib/prayer-connect/submitContentReport";
import type { FeedApprovedVideoResponsePreview } from "../../lib/community-feed/loadParentApprovedVideoResponses";
import styles from "./PublicVideoResponses.module.css";

type PublicVideoResponseSafetyMenuProps = {
  response: FeedApprovedVideoResponsePreview;
  parentStoryId: string;
  parentOwnerUserId: string | null;
  currentUserId: string | null;
  variant?: "card" | "toolbar";
  onActionMessage?: (message: string) => void;
  onResponseRemoved?: () => void;
};

export default function PublicVideoResponseSafetyMenu({
  response,
  parentStoryId,
  parentOwnerUserId,
  currentUserId,
  variant = "card",
  onActionMessage,
  onResponseRemoved,
}: PublicVideoResponseSafetyMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isAuthor = Boolean(currentUserId) && currentUserId === response.user_id;
  const isParentOwner =
    Boolean(currentUserId) &&
    Boolean(parentOwnerUserId) &&
    currentUserId === parentOwnerUserId;
  const canBlock =
    Boolean(currentUserId) &&
    Boolean(response.user_id) &&
    currentUserId !== response.user_id;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  async function requireSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      onActionMessage?.("Please sign in to manage this response.");
      return null;
    }
    return session.access_token;
  }

  async function handleReport() {
    if (busy) return;
    const token = await requireSession();
    if (!token) return;

    setBusy(true);
    try {
      const result = await submitContentReport({
        accessToken: token,
        contentType: "video_response",
        reason: "inappropriate",
        details: "Reported from Faith Responses",
        storyId: parentStoryId,
        responseId: response.id,
        reportedUserId: response.user_id,
      });
      if (result.ok !== true) {
        onActionMessage?.(result.error);
        return;
      }
      onActionMessage?.(
        result.duplicate
          ? "You already reported this response."
          : "Report submitted. Thank you for helping keep HTBF safe."
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleBlock() {
    if (busy || !currentUserId || !response.user_id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("blocked_users").upsert(
        {
          blocker_user_id: currentUserId,
          blocked_user_id: response.user_id,
        },
        { onConflict: "blocker_user_id,blocked_user_id" }
      );
      if (error) {
        onActionMessage?.(`Could not block user: ${error.message}`);
        return;
      }
      onActionMessage?.("User blocked. Their content is now hidden.");
      setOpen(false);
      onResponseRemoved?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;
    if (!isAuthor && !isParentOwner) return;

    const confirmed = window.confirm(
      isAuthor
        ? "Delete your video response? This cannot be undone."
        : "Remove this response from your post?"
    );
    if (!confirmed) return;

    const token = await requireSession();
    if (!token) return;

    setBusy(true);
    try {
      const result = await removePrayerVideoResponse({
        responseId: response.id,
        accessToken: token,
      });
      if (result.ok !== true) {
        onActionMessage?.(result.error);
        return;
      }
      onActionMessage?.(
        isAuthor
          ? "Your video response was removed."
          : "The response was removed from your post."
      );
      setOpen(false);
      onResponseRemoved?.();
    } finally {
      setBusy(false);
    }
  }

  const hasActions = canBlock || isAuthor || isParentOwner;
  if (!hasActions) return null;

  return (
    <div
      className={
        variant === "toolbar" ? styles.toolbarMenuRoot : styles.cardMenuRoot
      }
      ref={rootRef}
    >
      <button
        type="button"
        className={
          variant === "toolbar"
            ? styles.viewerMenu
            : styles.cardMenuTrigger
        }
        aria-label="Response options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div className={styles.cardMenuPanel} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.cardMenuItem}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void handleReport();
            }}
          >
            <Flag className="h-4 w-4 shrink-0" aria-hidden />
            Report
          </button>

          {canBlock ? (
            <button
              type="button"
              role="menuitem"
              className={`${styles.cardMenuItem} ${styles.cardMenuItemDanger}`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void handleBlock();
              }}
            >
              <UserX className="h-4 w-4 shrink-0" aria-hidden />
              Block user
            </button>
          ) : null}

          {isAuthor ? (
            <button
              type="button"
              role="menuitem"
              className={`${styles.cardMenuItem} ${styles.cardMenuItemDanger}`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void handleRemove();
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              Delete response
            </button>
          ) : null}

          {isParentOwner && !isAuthor ? (
            <button
              type="button"
              role="menuitem"
              className={`${styles.cardMenuItem} ${styles.cardMenuItemDanger}`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void handleRemove();
              }}
            >
              <UserMinus className="h-4 w-4 shrink-0" aria-hidden />
              Remove from post
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

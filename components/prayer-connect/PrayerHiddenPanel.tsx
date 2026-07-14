"use client";

import { useEffect, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { getPrayerTitle } from "../../lib/prayer-connect/utils";
import { unhidePrayer } from "../../lib/prayer-connect/hiddenPrayers";
import PrayerMobileSheet from "./PrayerMobileSheet";
import styles from "./PrayerConnect.module.css";

type HiddenPrayerRow = {
  id: string;
  title: string;
  createdAt: string | null;
};

type PrayerHiddenPanelProps = {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  hiddenIds: string[];
  onRestored: (storyId: string, nextHiddenIds: string[]) => void;
  onRefreshFeed: () => void;
};

export default function PrayerHiddenPanel({
  open,
  onClose,
  userId,
  hiddenIds,
  onRestored,
  onRefreshFeed,
}: PrayerHiddenPanelProps) {
  const [rows, setRows] = useState<HiddenPrayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId || hiddenIds.length === 0) {
      setRows([]);
      setError(null);
      return;
    }

    let cancelled = false;
    async function loadRows() {
      setLoading(true);
      setError(null);
      const { data, error: loadError } = await supabase
        .from("stories")
        .select("id, story_text, created_at")
        .in("id", hiddenIds);

      if (cancelled) return;

      if (loadError) {
        setError("Could not load hidden prayers.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(
        ((data as { id: string; story_text: string | null; created_at: string | null }[]) ??
          []
        ).map((story) => ({
          id: story.id,
          title: getPrayerTitle(story.story_text),
          createdAt: story.created_at,
        }))
      );
      setLoading(false);
    }

    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [open, userId, hiddenIds]);

  async function restore(storyId: string) {
    if (!userId || restoringId) return;
    setRestoringId(storyId);
    setError(null);
    try {
      const next = await unhidePrayer(userId, storyId);
      onRestored(storyId, next);
      onRefreshFeed();
    } catch (err) {
      console.error("Restore hidden prayer failed:", err);
      setError(
        err instanceof Error ? err.message : "Could not restore this prayer."
      );
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <PrayerMobileSheet
      open={open}
      onClose={onClose}
      side="bottom"
      ariaLabel="Hidden prayers"
      portal
    >
      <div className={styles.mobileSheetHandle} aria-hidden />
      <h2 className={styles.mobileSheetTitle}>Hidden prayers</h2>
      <p className={styles.composerHelp}>
        Only you can see this list. Restoring a prayer adds it back to your
        discovery feed.
      </p>

      {!userId ? (
        <p className={styles.detailMeta}>Sign in to manage hidden prayers.</p>
      ) : loading ? (
        <p className={styles.detailMeta}>Loading…</p>
      ) : hiddenIds.length === 0 ? (
        <p className={styles.detailMeta}>You have not hidden any prayers.</p>
      ) : rows.length === 0 ? (
        <p className={styles.detailMeta}>
          Hidden prayers could not be loaded. They remain hidden until restored.
        </p>
      ) : (
        <ul className={styles.actionMenuList}>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={styles.actionMenuItem}
                disabled={restoringId === row.id}
                onClick={() => void restore(row.id)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                <span>
                  Restore &ldquo;{row.title}&rdquo;
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className={styles.modalError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.sheetActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onClose}
        >
          <Eye className="h-4 w-4" aria-hidden />
          Close
        </button>
      </div>
    </PrayerMobileSheet>
  );
}

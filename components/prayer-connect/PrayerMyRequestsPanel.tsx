"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  NotebookPen,
  PauseCircle,
  Trash2,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { getPrayerTitle } from "../../lib/prayer-connect/utils";
import styles from "./PrayerConnect.module.css";

type MyPrayerRow = {
  id: string;
  story_text: string | null;
  story_type: string | null;
  prayer_status: string | null;
  status: string | null;
  created_at: string | null;
  location: string | null;
  answered_at: string | null;
};

type PrayerMyRequestsPanelProps = {
  onOpenPost: () => void;
  refreshKey: number;
};

export default function PrayerMyRequestsPanel({
  onOpenPost,
  refreshKey,
}: PrayerMyRequestsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<MyPrayerRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [updateDrafts, setUpdateDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setRows([]);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, story_text, story_type, prayer_status, status, created_at, location, answered_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setRows(
        ((data as MyPrayerRow[]) ?? []).filter((row) =>
          (row.story_type || "").toLowerCase().includes("prayer")
        )
      );
      setLoading(false);
    }

    void load();
  }, [refreshKey]);

  const counts = useMemo(() => {
    const answered = rows.filter((row) => row.prayer_status === "answered").length;
    return {
      total: rows.length,
      active: rows.length - answered,
      answered,
    };
  }, [rows]);

  async function markAnswered(id: string) {
    const { error } = await supabase
      .from("stories")
      .update({
        prayer_status: "answered",
        answered_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              prayer_status: "answered",
              answered_at: new Date().toISOString(),
            }
          : row
      )
    );
  }

  async function removeLocation(id: string) {
    const { error } = await supabase
      .from("stories")
      .update({ location: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, location: null } : row))
    );
  }

  async function addUpdate(id: string) {
    const body = updateDrafts[id]?.trim();
    if (!body || !userId) return;

    const { error } = await supabase.from("prayer_updates").insert({
      story_id: id,
      author_user_id: userId,
      body,
      update_type: "update",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setUpdateDrafts((current) => ({ ...current, [id]: "" }));
    setMessage("Update saved. People who follow this request can see it when Follow sync is enabled.");
  }

  async function removeRequest(id: string) {
    const confirmed = window.confirm(
      "Remove this prayer request from public view?"
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc("remove_my_story", {
      story_id: id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setRows((current) => current.filter((row) => row.id !== id));
  }

  if (loading) {
    return (
      <div className={styles.skeletonGrid} aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.skeletonCard} />
        ))}
      </div>
    );
  }

  if (!userId) {
    return (
      <div className={styles.emptyState}>
        <h2>Sign in to manage your prayer requests</h2>
        <Link href="/login" className={styles.primaryButton}>
          Sign in
        </Link>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h2>You have not posted a prayer request yet</h2>
        <p>Share a need so others can discover and pray with you.</p>
        <button type="button" className={styles.primaryButton} onClick={onOpenPost}>
          Post a Prayer Request
        </button>
      </div>
    );
  }

  return (
    <div>
      {message ? <p className={styles.errorText}>{message}</p> : null}
      <p className={styles.resultCount}>
        {counts.total} request{counts.total === 1 ? "" : "s"} · {counts.active}{" "}
        active · {counts.answered} answered
      </p>
      <div className={styles.cardGrid} style={{ marginTop: "0.85rem" }}>
        {rows.map((row) => (
          <article key={row.id} className={styles.card}>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>
                {getPrayerTitle(row.story_text)}
              </h3>
              <p className={styles.cardMeta}>
                {[
                  row.prayer_status === "answered" ? "Answered" : "Active",
                  row.status,
                  row.location || "No public location",
                ].join(" · ")}
              </p>

              <label className={styles.sheetLabel} htmlFor={`update-${row.id}`}>
                Add an update
              </label>
              <textarea
                id={`update-${row.id}`}
                className={styles.composerTextarea}
                rows={2}
                value={updateDrafts[row.id] || ""}
                onChange={(event) =>
                  setUpdateDrafts((current) => ({
                    ...current,
                    [row.id]: event.target.value,
                  }))
                }
                placeholder="Share how people can keep praying..."
              />

              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void addUpdate(row.id)}
                >
                  <NotebookPen className="h-4 w-4" aria-hidden />
                  Post Update
                </button>
                {row.prayer_status !== "answered" ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void markAnswered(row.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Mark Answered
                  </button>
                ) : (
                  <Link
                    href={`/share-your-story?type=testimony&from=answered&story=${row.id}`}
                    className={styles.secondaryButton}
                  >
                    Share as a Testimony
                  </Link>
                )}
                {row.location ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void removeLocation(row.id)}
                  >
                    <PauseCircle className="h-4 w-4" aria-hidden />
                    Remove Location
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.quietDanger}
                  onClick={() => void removeRequest(row.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

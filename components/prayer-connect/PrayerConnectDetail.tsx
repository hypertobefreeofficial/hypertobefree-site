"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Flag,
  HeartHandshake,
  Share2,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import {
  detectSensitivePersonalInfo,
  formatApproximateDistance,
  formatRelativeTime,
} from "../../lib/prayer-connect/utils";
import { submitWrittenPrayer } from "../../lib/prayer-connect/persistence";
import styles from "./PrayerConnect.module.css";

type PrayerConnectDetailProps = {
  request: PrayerConnectRequest;
  saved: boolean;
  following?: boolean;
  userPrayed?: boolean;
  userEncouraged?: boolean;
  followAvailable?: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onToggleFollow?: () => void;
  onPrayed: (requestId: string) => void;
  onEncouraged?: (requestId: string) => void;
};

export default function PrayerConnectDetail({
  request,
  saved,
  following = false,
  userPrayed = false,
  userEncouraged = false,
  followAvailable = true,
  onClose,
  onToggleSave,
  onToggleFollow,
  onPrayed,
  onEncouraged,
}: PrayerConnectDetailProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [praying, setPraying] = useState(false);
  const [encouraging, setEncouraging] = useState(false);
  const [localPrayed, setLocalPrayed] = useState(userPrayed);
  const [localEncouraged, setLocalEncouraged] = useState(userEncouraged);
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeBody, setWriteBody] = useState("");
  const [writing, setWriting] = useState(false);
  const sensitive = detectSensitivePersonalInfo(request.body);
  const allowEncouragement =
    !request.topics.length || request.topics.includes("allow-encouragement");
  const allowPublicPrayers =
    !request.topics.length || request.topics.includes("allow-public-prayers");
  const allowSharing =
    !request.topics.length || request.topics.includes("allow-sharing");

  useEffect(() => {
    setLocalPrayed(userPrayed);
    setLocalEncouraged(userEncouraged);
  }, [userPrayed, userEncouraged, request.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (writeOpen) setWriteOpen(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, writeOpen]);

  async function handleIPrayed() {
    if (localPrayed) {
      setMessage("You already marked that you prayed for this request.");
      return;
    }

    setPraying(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Sign in to mark that you prayed.");
        return;
      }

      const { error } = await supabase.from("story_reactions").insert({
        story_id: request.id,
        user_id: user.id,
        reaction_type: "praying",
      });

      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          setLocalPrayed(true);
          setMessage("You already prayed for this request.");
          return;
        }
        setMessage("Could not save your prayer right now. Please try again.");
        return;
      }

      setLocalPrayed(true);
      onPrayed(request.id);
      setMessage("Thank you for praying.");
    } catch {
      setMessage("Could not save your prayer right now. Please try again.");
    } finally {
      setPraying(false);
    }
  }

  async function handleEncourage() {
    if (!allowEncouragement) {
      setMessage("The requester turned off encouragement for this request.");
      return;
    }
    if (localEncouraged) {
      setMessage("You already sent encouragement.");
      return;
    }

    setEncouraging(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Sign in to send encouragement.");
        return;
      }
      const { error } = await supabase.from("story_reactions").insert({
        story_id: request.id,
        user_id: user.id,
        reaction_type: "encouraged",
      });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          setLocalEncouraged(true);
          setMessage("You already sent encouragement.");
          return;
        }
        setMessage("Could not send encouragement right now.");
        return;
      }
      setLocalEncouraged(true);
      onEncouraged?.(request.id);
      setMessage("Encouragement sent.");
    } catch {
      setMessage("Could not send encouragement right now.");
    } finally {
      setEncouraging(false);
    }
  }

  async function handleShare() {
    if (!allowSharing) {
      setMessage("The requester turned off sharing for this request.");
      return;
    }
    const url = `${window.location.origin}/prayer?story=${request.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: request.title,
          text: "Pray with me on Hyper to Be Free",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied.");
      }
    } catch {
      setMessage("Sharing was cancelled.");
    }
  }

  async function handleWritePrayer() {
    setWriting(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Sign in to write a prayer.");
        return;
      }
      await submitWrittenPrayer({
        userId: user.id,
        storyId: request.id,
        body: writeBody,
      });
      setWriteBody("");
      setWriteOpen(false);
      setMessage("Your written prayer was shared.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save your prayer."
      );
    } finally {
      setWriting(false);
    }
  }

  const mediaSrc = request.thumbnailUrl || request.imageUrl;
  const distance = formatApproximateDistance(request.distanceMiles);

  return (
    <div className={styles.detailOverlay} role="presentation" onClick={onClose}>
      <aside
        className={styles.detailPanel}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.detailHeader}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className={styles.detailBody}>
          {request.videoUrl ? (
            <video
              className={styles.detailMedia}
              src={request.videoUrl}
              controls
              playsInline
              preload="metadata"
              poster={mediaSrc || undefined}
            />
          ) : mediaSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc} alt="" className={styles.detailMedia} />
          ) : (
            <div className={styles.detailTextHero}>
              <span className={styles.cardCategoryChip}>{request.categoryLabel}</span>
              <p>{request.title}</p>
            </div>
          )}

          <h2 className={styles.detailTitle}>{request.title}</h2>
          <p className={styles.detailMeta}>
            {[
              request.isAnonymous
                ? "Anonymous request"
                : request.displayName || "HTBF community member",
              request.locationLabel,
              distance,
              formatRelativeTime(request.createdAt),
              request.categoryLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {request.prayerStatus === "answered" ? (
            <div className={styles.answeredBanner}>
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Marked answered
            </div>
          ) : null}

          <p className={styles.detailDescription}>
            {request.body || "No description provided."}
          </p>

          {sensitive.length > 0 ? (
            <div className={styles.privacyWarning} role="status">
              This request may include sensitive personal information (
              {sensitive.join(", ")}). Practice care before sharing.
            </div>
          ) : null}

          <div className={styles.detailStats}>
            <span>
              {request.prayingCount + (localPrayed && !userPrayed ? 1 : 0)} prayed
            </span>
            <span>
              {request.encouragementCount +
                (localEncouraged && !userEncouraged ? 1 : 0)}{" "}
              encouragements
            </span>
          </div>

          {message ? <p className={styles.inlineMessage}>{message}</p> : null}
        </div>

        <div className={styles.detailFooter}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleIPrayed()}
            disabled={praying || localPrayed}
          >
            <HeartHandshake className="h-4 w-4" aria-hidden />
            {localPrayed ? "You prayed" : praying ? "Saving..." : "I Prayed"}
          </button>

          {allowPublicPrayers ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setWriteOpen(true)}
            >
              Write a Prayer
            </button>
          ) : null}

          {allowEncouragement ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleEncourage()}
              disabled={encouraging || localEncouraged}
            >
              {localEncouraged
                ? "Encouraged"
                : encouraging
                  ? "Sending..."
                  : "Encourage"}
            </button>
          ) : null}

          <button type="button" className={styles.secondaryButton} onClick={onToggleSave}>
            <Bookmark className="h-4 w-4" aria-hidden />
            {saved ? "Saved" : "Save"}
          </button>

          {followAvailable && onToggleFollow ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onToggleFollow}
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : null}

          {allowSharing ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleShare()}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </button>
          ) : null}

          <Link href={`/feed?story=${request.id}`} className={styles.quietDanger}>
            <Flag className="h-4 w-4" aria-hidden />
            Report
          </Link>

          {request.prayerStatus === "answered" ? (
            <Link
              href={`/share-your-story?type=testimony&from=answered&story=${request.id}`}
              className={styles.secondaryButton}
            >
              Share as a Testimony
            </Link>
          ) : null}
        </div>
      </aside>

      {writeOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setWriteOpen(false)}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="write-prayer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="write-prayer-title">Write a Prayer</h2>
            <p className={styles.detailMeta}>
              Share a short written prayer for this request. Keep it respectful
              and avoid private contact details.
            </p>
            <textarea
              className={styles.composerTextarea}
              rows={5}
              value={writeBody}
              onChange={(event) => setWriteBody(event.target.value)}
              placeholder="Lord, I lift this request to You..."
              maxLength={2000}
            />
            {detectSensitivePersonalInfo(writeBody).length > 0 ? (
              <div className={styles.privacyWarning} role="status">
                Please remove addresses, phone numbers, or emails before
                sending.
              </div>
            ) : null}
            <div className={styles.emptyActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setWriteOpen(false)}
                disabled={writing}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void handleWritePrayer()}
                disabled={
                  writing ||
                  !writeBody.trim() ||
                  detectSensitivePersonalInfo(writeBody).length > 0
                }
              >
                {writing ? "Sending..." : "Send Prayer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

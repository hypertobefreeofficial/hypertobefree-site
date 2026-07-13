"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  submitPublicVideoPrayerResponse,
} from "../../lib/prayer-connect/communityResponses";
import { getPrayerInteractionPrefs } from "../../lib/prayer-connect/interactionPrefs";
import { uploadPrayerVideo } from "../../lib/prayer-connect/media";
import {
  sendPrivatePrayerMessage,
  sendPrivateVideoPrayer,
} from "../../lib/prayer-connect/privateResponses";
import { formatResponseCount } from "../../lib/prayer-connect/responseCounts";
import type { PrayerConnectRequest } from "../../lib/prayer-connect/types";
import {
  detectSensitivePersonalInfo,
  formatApproximateDistance,
  formatRelativeTime,
} from "../../lib/prayer-connect/utils";
import PrayerCommunityResponses from "./PrayerCommunityResponses";
import PrayerMedia from "./PrayerMedia";
import PrayerResponseChooser, {
  type PrayerResponseChoice,
} from "./PrayerResponseChooser";
import styles from "./PrayerConnect.module.css";

type PrayerConnectDetailProps = {
  request: PrayerConnectRequest;
  saved: boolean;
  following?: boolean;
  userPrayed?: boolean;
  userEncouraged?: boolean;
  followAvailable?: boolean;
  userId: string | null;
  onClose: () => void;
  onToggleSave: () => void;
  onToggleFollow?: () => void;
  onPrayed: (requestId: string) => void;
  onEncouraged?: (requestId: string) => void;
  onResponseCountChange?: (requestId: string, count: number) => void;
};

export default function PrayerConnectDetail({
  request,
  saved,
  following = false,
  userPrayed = false,
  userEncouraged = false,
  followAvailable = true,
  userId,
  onClose,
  onToggleSave,
  onToggleFollow,
  onPrayed,
  onEncouraged,
  onResponseCountChange,
}: PrayerConnectDetailProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [praying, setPraying] = useState(false);
  const [encouraging, setEncouraging] = useState(false);
  const [localPrayed, setLocalPrayed] = useState(userPrayed);
  const [localEncouraged, setLocalEncouraged] = useState(userEncouraged);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [activeResponse, setActiveResponse] =
    useState<PrayerResponseChoice | null>(null);
  const [privateBody, setPrivateBody] = useState("");
  const [privateVideoFile, setPrivateVideoFile] = useState<File | null>(null);
  const [publicVideoFile, setPublicVideoFile] = useState<File | null>(null);
  const [publicVideoPreview, setPublicVideoPreview] = useState("");
  const [privateVideoPreview, setPrivateVideoPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [communityRefreshKey, setCommunityRefreshKey] = useState(0);
  const [responseCount, setResponseCount] = useState(request.responseCount);

  const prefs = getPrayerInteractionPrefs(request.topics, request.prayerStatus);
  const sensitive = detectSensitivePersonalInfo(request.body);
  const distance = formatApproximateDistance(request.distanceMiles);
  const canRespond =
    prefs.acceptsNewResponses &&
    (prefs.allowPublicVideo ||
      prefs.allowPrivateMessage ||
      prefs.allowPrivateVideo);

  useEffect(() => {
    setResponseCount(request.responseCount);
  }, [request.id, request.responseCount]);

  useEffect(() => {
    setLocalPrayed(userPrayed);
    setLocalEncouraged(userEncouraged);
  }, [userPrayed, userEncouraged, request.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (activeResponse) {
        closeResponseModal();
        return;
      }
      if (chooserOpen) {
        setChooserOpen(false);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeResponse, chooserOpen, onClose]);

  useEffect(() => {
    return () => {
      if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
      if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    };
  }, [privateVideoPreview, publicVideoPreview]);

  function closeResponseModal() {
    setActiveResponse(null);
    setPrivateBody("");
    setPrivateVideoFile(null);
    setPublicVideoFile(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    setPublicVideoPreview("");
    setPrivateVideoPreview("");
  }

  function handleChooseResponse(choice: PrayerResponseChoice) {
    setChooserOpen(false);
    setActiveResponse(choice);
    setMessage(null);
  }

  async function requireUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Sign in to respond to this prayer request.");
      return null;
    }
    return user;
  }

  async function handleIPrayed() {
    if (localPrayed) {
      setMessage("You already marked that you prayed for this request.");
      return;
    }

    setPraying(true);
    setMessage(null);

    try {
      const user = await requireUser();
      if (!user) return;

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
    if (!prefs.allowEncouragement) {
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
      const user = await requireUser();
      if (!user) return;

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
    if (!prefs.allowSharing) {
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

  async function submitPublicVideo() {
    if (!publicVideoFile) {
      setMessage("Choose a video to upload.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const user = await requireUser();
      if (!user) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setMessage("Sign in to send a public video prayer.");
        return;
      }
      const videoUrl = await uploadPrayerVideo(user.id, publicVideoFile);
      await submitPublicVideoPrayerResponse({
        prayerStoryId: request.id,
        responseVideoUrl: videoUrl,
        accessToken: token,
      });
      closeResponseModal();
      setCommunityRefreshKey((value) => value + 1);
      setResponseCount((count) => {
        const next = count + 1;
        onResponseCountChange?.(request.id, next);
        return next;
      });
      setMessage("Your public video prayer was submitted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit your video prayer."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPrivateMessage() {
    setSubmitting(true);
    setMessage(null);
    try {
      const user = await requireUser();
      if (!user) return;
      if (!request.userId) {
        setMessage("This request cannot receive private messages right now.");
        return;
      }
      const result = await sendPrivatePrayerMessage({
        storyId: request.id,
        senderUserId: user.id,
        recipientUserId: request.userId,
        body: privateBody,
        storyTitle: request.title,
      });
      closeResponseModal();
      setMessage("Private message sent.");
      router.push(result.destination);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not send your message."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPrivateVideo() {
    if (!privateVideoFile) {
      setMessage("Choose a video to send.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const user = await requireUser();
      if (!user) return;
      if (!request.userId) {
        setMessage("This request cannot receive private video prayers right now.");
        return;
      }
      const result = await sendPrivateVideoPrayer({
        storyId: request.id,
        senderUserId: user.id,
        recipientUserId: request.userId,
        videoFile: privateVideoFile,
        storyTitle: request.title,
      });
      closeResponseModal();
      setMessage("Private video prayer sent.");
      router.push(result.destination);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not send your video prayer."
      );
    } finally {
      setSubmitting(false);
    }
  }

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
          <div className={styles.detailIdentity}>
            {request.avatarUrl ? (
              <img
                src={request.avatarUrl}
                alt=""
                className={styles.detailAvatar}
              />
            ) : (
              <span className={styles.detailAvatarFallback} aria-hidden>
                {(request.displayName || "A").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className={styles.detailIdentityCopy}>
              <p className={styles.detailIdentityName}>
                {request.isAnonymous
                  ? "Anonymous request"
                  : request.displayName || "HTBF community member"}
              </p>
              <p className={styles.detailIdentityMeta}>
                {[request.locationLabel, distance, formatRelativeTime(request.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className={styles.detailCategoryBadge}>{request.categoryLabel}</span>
          </div>

          <div className={styles.detailHero}>
            <PrayerMedia
              mediaKind={request.mediaKind}
              title={request.title}
              categoryLabel={request.categoryLabel}
              imageUrl={request.imageUrl}
              thumbnailUrl={request.thumbnailUrl}
              videoUrl={request.videoUrl}
              variant="detail"
              className={styles.detailMedia}
            />
          </div>

          <h2 className={styles.detailTitle}>{request.title}</h2>

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
            <span>{formatResponseCount(responseCount)}</span>
          </div>

          <PrayerCommunityResponses
            storyId={request.id}
            userId={userId}
            refreshKey={communityRefreshKey}
            onCountChange={(count) => {
              setResponseCount(count);
              onResponseCountChange?.(request.id, count);
            }}
          />

          {message ? <p className={styles.inlineMessage}>{message}</p> : null}
        </div>

        <div className={styles.detailFooter}>
          <div className={styles.detailPrimaryActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleIPrayed()}
              disabled={praying || localPrayed}
            >
              <HeartHandshake className="h-4 w-4" aria-hidden />
              {localPrayed ? "You prayed" : praying ? "Saving..." : "I Prayed"}
            </button>

            {canRespond ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setChooserOpen(true)}
              >
                Respond with Prayer
              </button>
            ) : null}
          </div>

          <div className={styles.detailSecondaryActions}>
            {prefs.allowEncouragement ? (
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

            {prefs.allowSharing ? (
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
        </div>
      </aside>

      <PrayerResponseChooser
        open={chooserOpen}
        prefs={prefs}
        onClose={() => setChooserOpen(false)}
        onChoose={handleChooseResponse}
      />

      {activeResponse ? (
        <div className={styles.modalOverlay} onClick={closeResponseModal}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            {activeResponse === "public-video" ? (
              <>
                <h2>Send a Public Video Prayer</h2>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPublicVideoFile(file);
                    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
                    setPublicVideoPreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
                {publicVideoPreview ? (
                  <video
                    className={styles.responsePreviewVideo}
                    src={publicVideoPreview}
                    controls
                    playsInline
                  />
                ) : null}
                <div className={styles.emptyActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeResponseModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={submitting || !publicVideoFile}
                    onClick={() => void submitPublicVideo()}
                  >
                    {submitting ? "Uploading..." : "Submit Video Prayer"}
                  </button>
                </div>
              </>
            ) : null}

            {activeResponse === "private-message" ? (
              <>
                <h2>Send a Private Message</h2>
                <p className={styles.detailMeta}>
                  Only the requester will see this in HTBF Messages.
                </p>
                <textarea
                  className={styles.composerTextarea}
                  rows={5}
                  value={privateBody}
                  onChange={(event) => setPrivateBody(event.target.value)}
                  placeholder="Share your encouragement privately..."
                  maxLength={2000}
                />
                <div className={styles.emptyActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeResponseModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={submitting || !privateBody.trim()}
                    onClick={() => void submitPrivateMessage()}
                  >
                    {submitting ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </>
            ) : null}

            {activeResponse === "private-video" ? (
              <>
                <h2>Send a Private Video Prayer</h2>
                <p className={styles.detailMeta}>
                  This video is delivered privately through Journey Inbox.
                </p>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPrivateVideoFile(file);
                    if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
                    setPrivateVideoPreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
                {privateVideoPreview ? (
                  <video
                    className={styles.responsePreviewVideo}
                    src={privateVideoPreview}
                    controls
                    playsInline
                  />
                ) : null}
                <div className={styles.emptyActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeResponseModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={submitting || !privateVideoFile}
                    onClick={() => void submitPrivateVideo()}
                  >
                    {submitting ? "Sending..." : "Send Private Video"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

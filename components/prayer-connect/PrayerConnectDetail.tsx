"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { getPublicVideoEligibility } from "../../lib/prayer-connect/eligibility";
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

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

function validateVideoFile(file: File): string | null {
  const type = file.type || "";
  const looksLikeVideo =
    type.startsWith("video/") || /\.(mp4|mov|webm|m4v|ogg)$/i.test(file.name);
  if (!looksLikeVideo) {
    return "Please choose a video file (MP4, MOV, or WebM).";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "That video is too large. Please choose a file under 100 MB.";
  }
  return null;
}

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
  const [submitPhase, setSubmitPhase] = useState<
    "idle" | "uploading" | "submitting"
  >("idle");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<string | null>(null);
  const [communityRefreshKey, setCommunityRefreshKey] = useState(0);
  const [responseCount, setResponseCount] = useState(request.responseCount);
  const respondButtonRef = useRef<HTMLButtonElement | null>(null);
  const publicFileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);

  const submitting = submitPhase !== "idle";
  const prefs = getPrayerInteractionPrefs(request.topics, request.prayerStatus);
  const eligibility = getPublicVideoEligibility({
    topics: request.topics,
    prayerStatus: request.prayerStatus,
  });
  const sensitive = detectSensitivePersonalInfo(request.body);
  const distance = formatApproximateDistance(request.distanceMiles);
  const canRespond = eligibility.canRespond;

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
        if (submitting) return; // don't dismiss mid-submission
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
  }, [activeResponse, chooserOpen, onClose, submitting]);

  useEffect(() => {
    return () => {
      if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
      if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    };
  }, [privateVideoPreview, publicVideoPreview]);

  useEffect(() => {
    if (!activeResponse) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeResponse]);

  function closeResponseModal() {
    setActiveResponse(null);
    setPrivateBody("");
    setPrivateVideoFile(null);
    setPublicVideoFile(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    setPublicVideoPreview("");
    setPrivateVideoPreview("");
    setSubmitPhase("idle");
    setModalError(null);
    setModalNotice(null);
    // Return focus to the action that opened the flow.
    requestAnimationFrame(() => respondButtonRef.current?.focus());
  }

  function handleChooseResponse(choice: PrayerResponseChoice) {
    setChooserOpen(false);
    setModalError(null);
    setModalNotice(null);
    setSubmitPhase("idle");
    setActiveResponse(choice);
    setMessage(null);
  }

  function selectPublicVideoFile(file: File | null) {
    setModalError(null);
    setModalNotice(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (!file) {
      setPublicVideoFile(null);
      setPublicVideoPreview("");
      return;
    }
    const validationError = validateVideoFile(file);
    if (validationError) {
      setPublicVideoFile(null);
      setPublicVideoPreview("");
      setModalError(validationError);
      return;
    }
    setPublicVideoFile(file);
    setPublicVideoPreview(URL.createObjectURL(file));
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
    // Prevent duplicate submissions while a request is in flight.
    if (submitPhase !== "idle") return;

    if (!publicVideoFile) {
      setModalError("Choose a video to upload.");
      return;
    }

    // Authoritative eligibility guard — never let the upload proceed if the
    // request is not accepting public responses.
    if (!eligibility.canPublicVideo) {
      setModalError(
        eligibility.reason ??
          "This prayer request is no longer accepting public responses."
      );
      return;
    }

    const validationError = validateVideoFile(publicVideoFile);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    setModalError(null);
    setModalNotice(null);

    try {
      const user = await requireUser();
      if (!user) {
        setModalError("Please sign in to send a public video prayer.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setModalError("Please sign in to send a public video prayer.");
        return;
      }

      setSubmitPhase("uploading");
      const videoUrl = await uploadPrayerVideo(user.id, publicVideoFile);

      setSubmitPhase("submitting");
      const result = await submitPublicVideoPrayerResponse({
        prayerStoryId: request.id,
        responseVideoUrl: videoUrl,
        accessToken: token,
      });

      if (result.ok !== true) {
        // Keep the modal open with a clear, retryable error.
        setSubmitPhase("idle");
        setModalError(result.error);
        return;
      }

      // Success — refresh the list once and update the visible count.
      setCommunityRefreshKey((value) => value + 1);
      if (result.status === "approved") {
        setResponseCount((count) => {
          const next = count + 1;
          onResponseCountChange?.(request.id, next);
          return next;
        });
      }

      const successMessage =
        result.status === "approved"
          ? "Your video prayer was submitted."
          : "Your video prayer was submitted for review.";
      closeResponseModal();
      setMessage(successMessage);
    } catch (error) {
      console.error("Public video prayer submission failed:", error);
      setSubmitPhase("idle");
      setModalError(
        error instanceof Error && error.message
          ? error.message
          : "Could not submit your video prayer. Please try again."
      );
    }
  }

  async function submitPrivateMessage() {
    if (submitPhase !== "idle") return;
    setModalError(null);
    setModalNotice(null);
    try {
      const user = await requireUser();
      if (!user) {
        setModalError("Please sign in to send a private message.");
        return;
      }
      if (!request.userId) {
        setModalError("This request cannot receive private messages right now.");
        return;
      }
      setSubmitPhase("submitting");
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
      console.error("Private message submission failed:", error);
      setSubmitPhase("idle");
      setModalError(
        error instanceof Error && error.message
          ? error.message
          : "Could not send your message. Please try again."
      );
    }
  }

  async function submitPrivateVideo() {
    if (submitPhase !== "idle") return;
    if (!privateVideoFile) {
      setModalError("Choose a video to send.");
      return;
    }
    const validationError = validateVideoFile(privateVideoFile);
    if (validationError) {
      setModalError(validationError);
      return;
    }
    setModalError(null);
    setModalNotice(null);
    try {
      const user = await requireUser();
      if (!user) {
        setModalError("Please sign in to send a private video prayer.");
        return;
      }
      if (!request.userId) {
        setModalError(
          "This request cannot receive private video prayers right now."
        );
        return;
      }
      setSubmitPhase("uploading");
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
      console.error("Private video prayer submission failed:", error);
      setSubmitPhase("idle");
      setModalError(
        error instanceof Error && error.message
          ? error.message
          : "Could not send your video prayer. Please try again."
      );
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
                ref={respondButtonRef}
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
        <div
          className={styles.modalOverlay}
          onClick={submitting ? undefined : closeResponseModal}
        >
          <div
            className={`${styles.modalCard} ${styles.responseModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              activeResponse === "public-video"
                ? "Send a public video prayer"
                : activeResponse === "private-message"
                  ? "Send a private message"
                  : "Send a private video prayer"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.responseModalHeader}>
              <h2>
                {activeResponse === "public-video"
                  ? "Send a Public Video Prayer"
                  : activeResponse === "private-message"
                    ? "Send a Private Message"
                    : "Send a Private Video Prayer"}
              </h2>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close"
                onClick={closeResponseModal}
                disabled={submitting}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className={styles.responseModalBody}>
              {activeResponse === "public-video" ? (
                <>
                  <p className={styles.detailMeta}>
                    Public video prayers can be seen by other believers after
                    approval.
                  </p>
                  <input
                    ref={publicFileInputRef}
                    type="file"
                    accept="video/*"
                    className={styles.visuallyHiddenInput}
                    onChange={(event) =>
                      selectPublicVideoFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <button
                    type="button"
                    className={styles.selectMediaButton}
                    onClick={() => publicFileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    {publicVideoFile ? "Change video" : "Select a video"}
                  </button>
                  {publicVideoFile ? (
                    <p className={styles.selectedFileName}>
                      {publicVideoFile.name}
                    </p>
                  ) : null}
                  {publicVideoPreview ? (
                    <video
                      className={styles.responsePreviewVideo}
                      src={publicVideoPreview}
                      controls
                      playsInline
                    />
                  ) : null}
                </>
              ) : null}

              {activeResponse === "private-message" ? (
                <>
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
                    disabled={submitting}
                  />
                </>
              ) : null}

              {activeResponse === "private-video" ? (
                <>
                  <p className={styles.detailMeta}>
                    This video is delivered privately through Journey Inbox.
                  </p>
                  <input
                    ref={privateFileInputRef}
                    type="file"
                    accept="video/*"
                    className={styles.visuallyHiddenInput}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setModalError(null);
                      if (privateVideoPreview)
                        URL.revokeObjectURL(privateVideoPreview);
                      if (!file) {
                        setPrivateVideoFile(null);
                        setPrivateVideoPreview("");
                        return;
                      }
                      const validationError = validateVideoFile(file);
                      if (validationError) {
                        setPrivateVideoFile(null);
                        setPrivateVideoPreview("");
                        setModalError(validationError);
                        return;
                      }
                      setPrivateVideoFile(file);
                      setPrivateVideoPreview(URL.createObjectURL(file));
                    }}
                  />
                  <button
                    type="button"
                    className={styles.selectMediaButton}
                    onClick={() => privateFileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    {privateVideoFile ? "Change video" : "Select a video"}
                  </button>
                  {privateVideoFile ? (
                    <p className={styles.selectedFileName}>
                      {privateVideoFile.name}
                    </p>
                  ) : null}
                  {privateVideoPreview ? (
                    <video
                      className={styles.responsePreviewVideo}
                      src={privateVideoPreview}
                      controls
                      playsInline
                    />
                  ) : null}
                </>
              ) : null}

              {modalError ? (
                <p className={styles.modalError} role="alert">
                  {modalError}
                </p>
              ) : null}
              {modalNotice ? (
                <p className={styles.modalNotice} role="status">
                  {modalNotice}
                </p>
              ) : null}
            </div>

            <div className={styles.responseModalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeResponseModal}
                disabled={submitting}
              >
                Cancel
              </button>
              {activeResponse === "public-video" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitting || !publicVideoFile}
                  onClick={() => void submitPublicVideo()}
                >
                  {submitPhase === "uploading" ? (
                    <>
                      <span className={styles.buttonSpinner} aria-hidden />
                      Uploading video…
                    </>
                  ) : submitPhase === "submitting" ? (
                    <>
                      <span className={styles.buttonSpinner} aria-hidden />
                      Submitting for review…
                    </>
                  ) : (
                    "Submit Video Prayer"
                  )}
                </button>
              ) : null}
              {activeResponse === "private-message" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitting || !privateBody.trim()}
                  onClick={() => void submitPrivateMessage()}
                >
                  {submitting ? (
                    <>
                      <span className={styles.buttonSpinner} aria-hidden />
                      Sending…
                    </>
                  ) : (
                    "Send Message"
                  )}
                </button>
              ) : null}
              {activeResponse === "private-video" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitting || !privateVideoFile}
                  onClick={() => void submitPrivateVideo()}
                >
                  {submitPhase === "uploading" ? (
                    <>
                      <span className={styles.buttonSpinner} aria-hidden />
                      Uploading video…
                    </>
                  ) : submitPhase === "submitting" ? (
                    <>
                      <span className={styles.buttonSpinner} aria-hidden />
                      Sending…
                    </>
                  ) : (
                    "Send Private Video"
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

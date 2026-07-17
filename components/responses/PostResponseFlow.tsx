"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { submitPublicVideoResponse } from "../../lib/prayer-connect/communityResponses";
import {
  sendPrivatePrayerMessage,
  sendPrivateVideoPrayer,
} from "../../lib/prayer-connect/privateResponses";
import { uploadPrayerVideoWithThumbnail } from "../../lib/prayer-connect/media";
import { validateVideoFile } from "../../lib/responses/validateResponseVideo";
import type {
  ResponseChoice,
  ResponseSourceContext,
} from "../../lib/responses/responseContext";
import { validateResponseVideo } from "../../lib/responses/validateResponseVideo";
import PostResponseChooser from "./PostResponseChooser";
import styles from "../prayer-connect/PrayerConnect.module.css";

type PostResponseFlowProps = {
  context: ResponseSourceContext;
  open: boolean;
  onClose: () => void;
  onComplete?: (detail: { success: boolean; message?: string }) => void;
  returnBehavior?: "stay" | "navigate";
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

export default function PostResponseFlow({
  context,
  open,
  onClose,
  onComplete,
  returnBehavior = "navigate",
  triggerRef,
}: PostResponseFlowProps) {
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [activeResponse, setActiveResponse] = useState<ResponseChoice | null>(
    null
  );
  const [privateBody, setPrivateBody] = useState("");
  const [publicVideoFile, setPublicVideoFile] = useState<File | null>(null);
  const [publicVideoPreview, setPublicVideoPreview] = useState("");
  const [privateVideoFile, setPrivateVideoFile] = useState<File | null>(null);
  const [privateVideoPreview, setPrivateVideoPreview] = useState("");
  const [submitPhase, setSubmitPhase] = useState<
    "idle" | "uploading" | "submitting"
  >("idle");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<string | null>(null);
  const publicFileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setChooserOpen(true);
      setActiveResponse(null);
      setModalError(null);
      setModalNotice(null);
    } else {
      setChooserOpen(false);
      setActiveResponse(null);
    }
  }, [open]);

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

  function closeAll() {
    setChooserOpen(false);
    setActiveResponse(null);
    setPrivateBody("");
    setPublicVideoFile(null);
    setPrivateVideoFile(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    setPublicVideoPreview("");
    setPrivateVideoPreview("");
    setSubmitPhase("idle");
    setModalError(null);
    setModalNotice(null);
    onClose();
    requestAnimationFrame(() => {
      triggerRef?.current?.focus();
    });
  }

  function closeResponseModal() {
    setActiveResponse(null);
    setPrivateBody("");
    setPublicVideoFile(null);
    setPrivateVideoFile(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (privateVideoPreview) URL.revokeObjectURL(privateVideoPreview);
    setPublicVideoPreview("");
    setPrivateVideoPreview("");
    setSubmitPhase("idle");
    setModalError(null);
    setModalNotice(null);
    setChooserOpen(true);
  }

  async function requireUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setModalError(context.labels.signInRequired);
      return null;
    }
    return user;
  }

  async function selectPublicVideoFile(file: File | null) {
    setModalError(null);
    setModalNotice(null);
    if (publicVideoPreview) URL.revokeObjectURL(publicVideoPreview);
    if (!file) {
      setPublicVideoFile(null);
      setPublicVideoPreview("");
      return;
    }
    const validationError = await validateResponseVideo(file);
    if (validationError) {
      setPublicVideoFile(null);
      setPublicVideoPreview("");
      setModalError(validationError);
      return;
    }
    setPublicVideoFile(file);
    setPublicVideoPreview(URL.createObjectURL(file));
  }

  async function submitPublicVideo() {
    if (submitPhase !== "idle") return;
    if (!publicVideoFile) {
      setModalError("Choose a video to upload.");
      return;
    }
    if (!context.canPublicVideo) {
      setModalError(
        context.publicVideoBlockReason ?? context.labels.notAcceptingResponses
      );
      return;
    }
    const validationError = validateVideoFile(publicVideoFile);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    try {
      const user = await requireUser();
      if (!user) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setModalError(context.labels.signInRequired);
        return;
      }

      setSubmitPhase("uploading");
      const upload = await uploadPrayerVideoWithThumbnail(
        user.id,
        publicVideoFile
      );
      setSubmitPhase("submitting");
      const result = await submitPublicVideoResponse({
        sourceType: context.sourceType,
        sourcePostId: context.storyId,
        responseVideoUrl: upload.videoUrl,
        responseThumbnailUrl: upload.thumbnailUrl,
        accessToken: token,
      });

      if (result.ok !== true) {
        setSubmitPhase("idle");
        setModalError(result.error);
        return;
      }

      closeAll();
      onComplete?.({
        success: true,
        message:
          result.status === "approved"
            ? "Your video response was submitted."
            : "Your video response was submitted for review.",
      });
    } catch (error) {
      setSubmitPhase("idle");
      setModalError(
        error instanceof Error && error.message
          ? error.message
          : "Could not submit your video response. Please try again."
      );
    }
  }

  async function submitPrivateMessage() {
    if (submitPhase !== "idle") return;
    try {
      const user = await requireUser();
      if (!user) return;
      if (!context.authorUserId) {
        setModalError("This post cannot receive private messages right now.");
        return;
      }
      setSubmitPhase("submitting");
      const result = await sendPrivatePrayerMessage({
        storyId: context.storyId,
        senderUserId: user.id,
        recipientUserId: context.authorUserId,
        body: privateBody,
        storyTitle: context.storyTitle,
        messagePreviewPrefix: context.labels.messagePreviewPrefix,
      });
      closeAll();
      if (returnBehavior === "navigate") {
        router.push(result.destination);
      }
      onComplete?.({ success: true, message: "Private message sent." });
    } catch (error) {
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
    try {
      const user = await requireUser();
      if (!user) return;
      if (!context.authorUserId) {
        setModalError("This post cannot receive private video responses right now.");
        return;
      }
      setSubmitPhase("uploading");
      const result = await sendPrivateVideoPrayer({
        storyId: context.storyId,
        senderUserId: user.id,
        recipientUserId: context.authorUserId,
        videoFile: privateVideoFile,
        storyTitle: context.storyTitle,
        labels: context.labels,
      });
      closeAll();
      if (returnBehavior === "navigate") {
        router.push(result.destination);
      }
      onComplete?.({ success: true, message: "Private video response sent." });
    } catch (error) {
      setSubmitPhase("idle");
      setModalError(
        error instanceof Error && error.message
          ? error.message
          : "Could not send your video response. Please try again."
      );
    }
  }

  if (!open && !activeResponse) return null;

  return (
    <>
      <PostResponseChooser
        open={open && chooserOpen && !activeResponse}
        prefs={context.prefs}
        labels={context.labels}
        onClose={closeAll}
        onChoose={(choice) => {
          setChooserOpen(false);
          setActiveResponse(choice);
          setModalError(null);
          setModalNotice(null);
        }}
      />

      {activeResponse ? (
        <div
          className={styles.modalOverlay}
          onClick={submitPhase !== "idle" ? undefined : closeResponseModal}
        >
          <div
            className={`${styles.modalCard} ${styles.responseModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              activeResponse === "public-video"
                ? context.labels.modalPublicVideoTitle
                : activeResponse === "private-message"
                  ? context.labels.modalPrivateMessageTitle
                  : context.labels.modalPrivateVideoTitle
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.responseModalHeader}>
              <h2>
                {activeResponse === "public-video"
                  ? context.labels.modalPublicVideoTitle
                  : activeResponse === "private-message"
                    ? context.labels.modalPrivateMessageTitle
                    : context.labels.modalPrivateVideoTitle}
              </h2>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close"
                onClick={closeResponseModal}
                disabled={submitPhase !== "idle"}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className={styles.responseModalBody}>
              {activeResponse === "public-video" ? (
                <>
                  <p className={styles.detailMeta}>
                    {context.labels.modalPublicVideoMeta}
                  </p>
                  <input
                    ref={publicFileInputRef}
                    type="file"
                    accept="video/*"
                    className={styles.visuallyHiddenInput}
                    onChange={(event) =>
                      void selectPublicVideoFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <button
                    type="button"
                    className={styles.selectMediaButton}
                    onClick={() => publicFileInputRef.current?.click()}
                    disabled={submitPhase !== "idle"}
                  >
                    {publicVideoFile ? "Change video" : "Select a video"}
                  </button>
                  {publicVideoFile ? (
                    <p className={styles.selectedFileName}>{publicVideoFile.name}</p>
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
                    {context.labels.modalPrivateMessageMeta}
                  </p>
                  <textarea
                    className={styles.composerTextarea}
                    rows={5}
                    value={privateBody}
                    onChange={(event) => setPrivateBody(event.target.value)}
                    placeholder="Share your encouragement privately..."
                    maxLength={2000}
                    disabled={submitPhase !== "idle"}
                  />
                </>
              ) : null}

              {activeResponse === "private-video" ? (
                <>
                  <p className={styles.detailMeta}>
                    {context.labels.modalPrivateVideoMeta}
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
                      void (async () => {
                        const validationError = await validateResponseVideo(file);
                        if (validationError) {
                          setPrivateVideoFile(null);
                          setPrivateVideoPreview("");
                          setModalError(validationError);
                          return;
                        }
                        setPrivateVideoFile(file);
                        setPrivateVideoPreview(URL.createObjectURL(file));
                      })();
                    }}
                  />
                  <button
                    type="button"
                    className={styles.selectMediaButton}
                    onClick={() => privateFileInputRef.current?.click()}
                    disabled={submitPhase !== "idle"}
                  >
                    {privateVideoFile ? "Change video" : "Select a video"}
                  </button>
                  {privateVideoFile ? (
                    <p className={styles.selectedFileName}>{privateVideoFile.name}</p>
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
                disabled={submitPhase !== "idle"}
              >
                Cancel
              </button>
              {activeResponse === "public-video" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitPhase !== "idle" || !publicVideoFile}
                  onClick={() => void submitPublicVideo()}
                >
                  {submitPhase === "uploading"
                    ? "Uploading video…"
                    : submitPhase === "submitting"
                      ? "Submitting…"
                      : context.labels.submitPublicVideo}
                </button>
              ) : null}
              {activeResponse === "private-message" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitPhase !== "idle" || !privateBody.trim()}
                  onClick={() => void submitPrivateMessage()}
                >
                  {submitPhase === "submitting" ? "Sending…" : "Send Message"}
                </button>
              ) : null}
              {activeResponse === "private-video" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitPhase !== "idle" || !privateVideoFile}
                  onClick={() => void submitPrivateVideo()}
                >
                  {submitPhase === "uploading"
                    ? "Uploading video…"
                    : submitPhase === "submitting"
                      ? "Sending…"
                      : context.labels.submitPrivateVideo}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

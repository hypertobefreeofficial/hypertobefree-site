"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  MapPin,
  Search,
  Type,
  Video,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import type {
  PrayerConnectCategoryFilter,
  PrayerConnectMediaKind,
} from "../../lib/prayer-connect/types";
import { geocodePlaceQuery } from "../../lib/prayer-connect/geocodePlace";
import {
  buildPublicGeoForPrayer,
  type LocationVisibility,
} from "../../lib/prayer-connect/publicGeo";
import { buildInteractionTopics } from "../../lib/prayer-connect/interactionPrefs";
import {
  MAX_CUSTOM_PRAYER_TYPE_LENGTH,
  PRAYER_TYPE_OPTIONS,
  detectSensitivePersonalInfo,
  sanitizeCustomPrayerType,
} from "../../lib/prayer-connect/utils";
import { uploadPrayerPhoto, uploadPrayerVideoWithThumbnail } from "../../lib/prayer-connect/media";
import styles from "./PrayerConnect.module.css";

const TOTAL_STEPS = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_PRAYER_REQUEST_VIDEO_SECONDS = 120;

function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(video.duration) ? video.duration : null);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      video.src = url;
    } catch {
      resolve(null);
    }
  });
}

type LocationMode =
  | "none"
  | "country"
  | "state"
  | "city"
  | "approximate"
  | "map-place";

type PrayerPostComposerProps = {
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
};

const STEP_LABELS = [
  "Content",
  "Media & category",
  "Location privacy",
  "Visibility",
  "Preview",
  "Publish",
] as const;

function sanitizeLocationPart(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>{}[\]\\|`]/g, "")
    .slice(0, 80);
}

function emailPrefix(email: string | null | undefined) {
  if (!email) return null;
  const prefix = email.split("@")[0]?.trim();
  return prefix || null;
}

export default function PrayerPostComposer({
  open,
  onClose,
  onPublished,
}: PrayerPostComposerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaKind, setMediaKind] = useState<PrayerConnectMediaKind>("text");
  const [category, setCategory] =
    useState<Exclude<PrayerConnectCategoryFilter, "all">>("faith");
  const [typeQuery, setTypeQuery] = useState("");
  // Display label for a listed prayer type (empty when "Other" is chosen).
  const [prayerTypeLabel, setPrayerTypeLabel] = useState("");
  const [otherSelected, setOtherSelected] = useState(false);
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [customConfirmed, setCustomConfirmed] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("none");
  const [locationText, setLocationText] = useState("");
  const [resolvedPlaceLabel, setResolvedPlaceLabel] = useState<string | null>(
    null
  );
  const [placeResolving, setPlaceResolving] = useState(false);
  const [allowEncouragement, setAllowEncouragement] = useState(true);
  const [allowPublicVideo, setAllowPublicVideo] = useState(true);
  const [allowPrivateMessage, setAllowPrivateMessage] = useState(true);
  const [allowPrivateVideo, setAllowPrivateVideo] = useState(true);
  const [allowSharing, setAllowSharing] = useState(true);
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [receiveUpdates, setReceiveUpdates] = useState(true);
  const [sensitiveAck, setSensitiveAck] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setStep(1);
    setTitle("");
    setDescription("");
    setMediaKind("text");
    setCategory("faith");
    setTypeQuery("");
    setPrayerTypeLabel("");
    setOtherSelected(false);
    setCustomCategoryLabel("");
    setCustomConfirmed(false);
    setIsUrgent(false);
    setMediaFile(null);
    setLocationMode("none");
    setLocationText("");
    setResolvedPlaceLabel(null);
    setAllowEncouragement(true);
    setAllowPublicVideo(true);
    setAllowPrivateMessage(true);
    setAllowPrivateVideo(true);
    setAllowSharing(true);
    setPostAnonymous(false);
    setReceiveUpdates(true);
    setSensitiveAck(false);
    setPublishing(false);
    setError(null);
    setPublishMessage(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !publishing) {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, publishing]);

  const storyText = [title.trim(), description.trim()]
    .filter(Boolean)
    .join("\n\n");

  const sensitiveFindings = detectSensitivePersonalInfo(
    `${title}\n${description}\n${locationText}`
  );

  const customTypeValue = sanitizeCustomPrayerType(customCategoryLabel);

  // The label that will be stored and shown on cards. For "Other" this is the
  // user's custom wording; otherwise it is the chosen listed type.
  const effectiveTypeLabel = otherSelected ? customTypeValue : prayerTypeLabel;

  const categoryLabel = effectiveTypeLabel || "Prayer request";

  const typeNeedle = typeQuery.trim().toLowerCase();
  const filteredPrayerTypes = PRAYER_TYPE_OPTIONS.filter((item) => {
    if (item.label === "Other") return false;
    if (!typeNeedle) return true;
    return item.label.toLowerCase().includes(typeNeedle);
  });
  const showUseAsOther =
    typeNeedle.length > 0 && filteredPrayerTypes.length === 0;

  function selectPrayerType(option: (typeof PRAYER_TYPE_OPTIONS)[number]) {
    if (option.label === "Other") {
      selectOtherType("");
      return;
    }
    setCategory(option.category);
    setPrayerTypeLabel(option.label);
    setOtherSelected(false);
    setCustomCategoryLabel("");
    setCustomConfirmed(false);
    setError(null);
  }

  function selectOtherType(prefill: string) {
    setCategory("other");
    setPrayerTypeLabel("");
    setOtherSelected(true);
    setCustomCategoryLabel(prefill);
    setCustomConfirmed(false);
    setError(null);
  }

  function buildLocationLabel(): string | null {
    if (locationMode === "none") return null;

    if (locationMode === "map-place") {
      const label = sanitizeLocationPart(
        resolvedPlaceLabel || locationText
      );
      return label || null;
    }

    const cleaned = sanitizeLocationPart(locationText);
    if (!cleaned) return null;

    if (locationMode === "approximate") {
      return `Near ${cleaned}`;
    }

    return cleaned;
  }

  function validateStep(current: number): string | null {
    if (current === 1) {
      if (!title.trim()) return "Add a short title for your prayer request.";
      if (title.trim().length > 120) {
        return "Keep the title under 120 characters.";
      }
      if (!description.trim()) {
        return "Share a little more so others know how to pray.";
      }
      return null;
    }

    if (current === 2) {
      if (mediaKind !== "text" && !mediaFile) {
        return `Choose a ${mediaKind} file, or switch to text-only.`;
      }
      if (otherSelected) {
        if (!customTypeValue) {
          return "Add your custom prayer type, or choose one from the list.";
        }
        if (customTypeValue.length > MAX_CUSTOM_PRAYER_TYPE_LENGTH) {
          return `Keep the custom prayer type under ${MAX_CUSTOM_PRAYER_TYPE_LENGTH} characters.`;
        }
        if (!customConfirmed) {
          return "Confirm your custom prayer type to continue.";
        }
      } else if (!prayerTypeLabel) {
        return "Choose a prayer type.";
      }
      return null;
    }

    if (current === 3) {
      if (locationMode !== "none" && !sanitizeLocationPart(locationText)) {
        return "Enter a privacy-safe location, or choose No location.";
      }
      if (locationMode === "map-place" && !resolvedPlaceLabel) {
        return "Look up the place on the map before continuing.";
      }
      return null;
    }

    if (current === 5 && sensitiveFindings.length > 0 && !sensitiveAck) {
      return "Confirm you understand the privacy warning before publishing.";
    }

    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function onMediaKindChange(kind: PrayerConnectMediaKind) {
    setMediaKind(kind);
    setMediaFile(null);
    setError(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setMediaFile(null);
      return;
    }

    if (mediaKind === "photo") {
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("That image is too large. Please choose a file under 10 MB.");
        return;
      }
      setError(null);
      setMediaFile(file);
      return;
    }

    if (mediaKind === "video") {
      if (!file.type.startsWith("video/")) {
        setError("Please choose a video file.");
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setError("That video is too large. Please choose a file under 100 MB.");
        return;
      }
      // Duration check (metadata). Server remains the backstop.
      void (async () => {
        const duration = await readVideoDurationSeconds(file);
        if (
          duration != null &&
          duration > MAX_PRAYER_REQUEST_VIDEO_SECONDS + 0.5
        ) {
          setError(
            `Prayer request videos must be ${MAX_PRAYER_REQUEST_VIDEO_SECONDS} seconds or shorter.`
          );
          setMediaFile(null);
          return;
        }
        setError(null);
        setMediaFile(file);
      })();
      return;
    }

    setError(null);
    setMediaFile(file);
  }

  async function resolveMapPlace() {
    const query = locationText.trim();
    if (!query) {
      setError("Enter a city, region, or place name to look up.");
      return;
    }

    setPlaceResolving(true);
    setError(null);
    setResolvedPlaceLabel(null);

    try {
      const result = await geocodePlaceQuery(query);
      if (!result) {
        setError("Could not find that place. Try a broader city or region.");
        return;
      }
      setResolvedPlaceLabel(result.label);
      setLocationText(result.label);
    } catch {
      setError("Place lookup failed. Try again or choose a simpler location.");
    } finally {
      setPlaceResolving(false);
    }
  }

  async function uploadPhoto(userId: string, file: File) {
    return uploadPrayerPhoto(userId, file);
  }

  async function moderateStory(text: string, hasVideo: boolean, hasPhoto: boolean) {
    try {
      const response = await fetch("/api/moderate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_type: "Prayer Request",
          story_text: text,
          has_video: hasVideo,
          has_photo: hasPhoto,
        }),
      });

      if (!response.ok) throw new Error("Moderation unavailable");

      const data = (await response.json()) as { statusToUse?: string };
      return data.statusToUse === "approved" ? "approved" : "submitted";
    } catch {
      // Match share-your-story: send to review when moderation is unavailable.
      return "submitted" as const;
    }
  }

  async function handlePublish(event?: FormEvent) {
    event?.preventDefault();

    const previewProblem = validateStep(5);
    if (previewProblem) {
      setError(previewProblem);
      setStep(5);
      return;
    }

    const contentProblem = validateStep(1) || validateStep(2) || validateStep(3);
    if (contentProblem) {
      setError(contentProblem);
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Prayer posting is not configured yet.");
      return;
    }

    setPublishing(true);
    setError(null);
    setPublishMessage("Checking your account…");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw new Error(userError.message);
      if (!user) {
        setError("Please sign in to post a prayer request.");
        setPublishing(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username, email")
        .eq("id", user.id)
        .maybeSingle();

      const displayName = postAnonymous
        ? "Anonymous"
        : profile?.display_name?.trim() ||
          profile?.username?.trim() ||
          emailPrefix(profile?.email || user.email) ||
          "HTBF Community";

      const hasPhoto = mediaKind === "photo" && Boolean(mediaFile);
      const hasVideo = mediaKind === "video" && Boolean(mediaFile);

      setPublishMessage("Reviewing your prayer…");
      const status = await moderateStory(storyText, hasVideo, hasPhoto);

      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      if (hasPhoto && mediaFile) {
        setPublishMessage("Uploading photo…");
        imageUrl = await uploadPhoto(user.id, mediaFile);
      }

      if (hasVideo && mediaFile) {
        setPublishMessage("Uploading video and creating thumbnail…");
        const upload = await uploadPrayerVideoWithThumbnail(user.id, mediaFile);
        videoUrl = upload.videoUrl;
        thumbnailUrl = upload.thumbnailUrl;
        if (upload.thumbnailFailed) {
          console.warn("Prayer request thumbnail failed:", upload.thumbnailError);
        }
      }

      const topics = buildInteractionTopics({
        category,
        prayerTypeLabel: effectiveTypeLabel,
        isUrgent,
        allowEncouragement,
        allowPublicVideo,
        allowPrivateMessage,
        allowPrivateVideo,
        allowSharing,
        receiveUpdates,
        postAnonymous,
      });

      setPublishMessage("Publishing…");

      const locationLabel = buildLocationLabel();
      const geo = buildPublicGeoForPrayer({
        locationLabel,
        visibility: locationMode as LocationVisibility,
        seed: `${user.id}:${title.trim()}`,
      });

      const payload: Record<string, unknown> = {
        user_id: user.id,
        name: displayName,
        location: geo.location,
        story_type: "Prayer Request",
        story_text: storyText,
        image_url: imageUrl,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        status,
        prayer_status: "active",
        topics,
        public_lat: geo.public_lat,
        public_lng: geo.public_lng,
        public_location_label: geo.public_location_label,
        location_visibility: geo.location_visibility,
      };

      const { error: insertError } = await supabase
        .from("stories")
        .insert(payload);

      if (insertError) {
        // Graceful fallbacks for schemas missing newer prayer geo columns or topics.
        const message = insertError.message || "";
        if (/public_lat|public_lng|public_location_label|location_visibility/i.test(message)) {
          const {
            public_lat: _a,
            public_lng: _b,
            public_location_label: _c,
            location_visibility: _d,
            ...withoutGeo
          } = payload;
          const { error: geoFallbackError } = await supabase
            .from("stories")
            .insert(withoutGeo);
          if (geoFallbackError) {
            if (/topics/i.test(geoFallbackError.message)) {
              const { topics: _topics, ...withoutTopics } = withoutGeo;
              const { error: topicsFallbackError } = await supabase
                .from("stories")
                .insert(withoutTopics);
              if (topicsFallbackError) throw new Error(topicsFallbackError.message);
            } else {
              throw new Error(geoFallbackError.message);
            }
          }
        } else if (/topics/i.test(message)) {
          const { topics: _topics, ...withoutTopics } = payload;
          const { error: fallbackError } = await supabase
            .from("stories")
            .insert(withoutTopics);
          if (fallbackError) throw new Error(fallbackError.message);
        } else {
          throw new Error(message);
        }
      }

      setPublishMessage(
        status === "approved"
          ? "Your prayer request is live."
          : "Submitted for review. It will appear after approval."
      );
      onPublished();
      window.setTimeout(() => {
        onClose();
      }, 700);
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : "Could not publish your prayer request.";
      setError(message);
      setPublishMessage(null);
    } finally {
      setPublishing(false);
    }
  }

  if (!open) return null;

  const locationPreview = buildLocationLabel();

  return (
    <div
      className={styles.modalOverlay}
      onClick={() => {
        if (!publishing) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.composerDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.composerHeader}>
          <div>
            <p className={styles.eyebrow}>Prayer Connect</p>
            <h2 id={titleId}>Post a Prayer Request</h2>
            <p className={styles.composerStepMeta}>
              Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close composer"
            disabled={publishing}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className={styles.composerProgress} aria-hidden>
          {STEP_LABELS.map((label, index) => {
            const n = index + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span
                key={label}
                className={`${styles.composerProgressDot} ${
                  active ? styles.composerProgressDotActive : ""
                } ${done ? styles.composerProgressDotDone : ""}`}
              />
            );
          })}
        </div>

        <div className={styles.composerBody}>
          {step === 1 ? (
            <section className={styles.composerSection}>
              <label className={styles.sheetLabel} htmlFor="prayer-title">
                Title
              </label>
              <input
                id="prayer-title"
                className={styles.composerInput}
                value={title}
                maxLength={120}
                placeholder="What should people pray for?"
                onChange={(event) => setTitle(event.target.value)}
              />

              <label className={styles.sheetLabel} htmlFor="prayer-description">
                Description
              </label>
              <textarea
                id="prayer-description"
                className={styles.composerTextarea}
                value={description}
                rows={6}
                placeholder="Share enough for people to pray with care. Avoid private details you would not want public."
                onChange={(event) => setDescription(event.target.value)}
              />
            </section>
          ) : null}

          {step === 2 ? (
            <section className={styles.composerSection}>
              <p className={styles.sheetLabel}>Media type</p>
              <div className={styles.pillRow}>
                {(
                  [
                    { id: "text", label: "Text", Icon: Type },
                    { id: "photo", label: "Photo", Icon: ImageIcon },
                    { id: "video", label: "Video", Icon: Video },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.pill} ${
                      mediaKind === id ? styles.pillActive : ""
                    }`}
                    aria-pressed={mediaKind === id}
                    onClick={() => onMediaKindChange(id)}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>

              {mediaKind !== "text" ? (
                <>
                  <label className={styles.sheetLabel} htmlFor="prayer-media">
                    {mediaKind === "photo" ? "Photo upload" : "Video upload"}{" "}
                    (optional but recommended)
                  </label>
                  <input
                    id="prayer-media"
                    type="file"
                    accept={mediaKind === "photo" ? "image/*" : "video/*"}
                    className={styles.composerFile}
                    onChange={onFileChange}
                  />
                  {mediaPreviewUrl ? (
                    mediaKind === "photo" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaPreviewUrl}
                        alt=""
                        className={styles.composerMediaPreview}
                      />
                    ) : (
                      <video
                        src={mediaPreviewUrl}
                        className={styles.composerMediaPreview}
                        controls
                        playsInline
                      />
                    )
                  ) : null}
                </>
              ) : null}

              <p className={styles.sheetLabel}>Prayer type</p>
              <div className={styles.composerSearchField}>
                <Search className="h-4 w-4" aria-hidden />
                <input
                  id="prayer-type-search"
                  className={styles.composerSearchInput}
                  value={typeQuery}
                  placeholder="Search prayer types (try del, grief, marriage)…"
                  aria-label="Search prayer types"
                  onChange={(event) => setTypeQuery(event.target.value)}
                />
              </div>

              <div className={styles.pillRow} role="listbox" aria-label="Prayer types">
                {filteredPrayerTypes.map((item) => {
                  const selected = !otherSelected && prayerTypeLabel === item.label;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`${styles.pill} ${
                        selected ? styles.pillActive : ""
                      }`}
                      onClick={() => selectPrayerType(item)}
                    >
                      {item.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="option"
                  aria-selected={otherSelected}
                  className={`${styles.pill} ${
                    otherSelected ? styles.pillActive : ""
                  }`}
                  onClick={() => selectOtherType(customCategoryLabel)}
                >
                  Other
                </button>
              </div>

              {showUseAsOther ? (
                <button
                  type="button"
                  className={styles.useAsOtherButton}
                  onClick={() => selectOtherType(typeQuery)}
                >
                  Use “{typeQuery.trim()}” as Other
                </button>
              ) : null}

              {otherSelected ? (
                <div className={styles.customTypeBlock}>
                  <label className={styles.sheetLabel} htmlFor="prayer-custom-type">
                    Custom prayer type
                  </label>
                  <input
                    id="prayer-custom-type"
                    className={styles.composerInput}
                    value={customCategoryLabel}
                    maxLength={MAX_CUSTOM_PRAYER_TYPE_LENGTH}
                    placeholder="Prayer for deliverance from spiritual oppression"
                    onChange={(event) => {
                      setCustomCategoryLabel(event.target.value);
                      setCustomConfirmed(false);
                    }}
                  />
                  <p className={styles.composerHelp}>
                    {customTypeValue.length}/{MAX_CUSTOM_PRAYER_TYPE_LENGTH}{" "}
                    characters
                  </p>
                  <label className={styles.composerToggle}>
                    <input
                      type="checkbox"
                      checked={customConfirmed}
                      disabled={!customTypeValue}
                      onChange={(event) => setCustomConfirmed(event.target.checked)}
                    />
                    <span>
                      Use “{customTypeValue || "your wording"}” as my prayer type
                    </span>
                  </label>
                </div>
              ) : null}

              {effectiveTypeLabel && (!otherSelected || customConfirmed) ? (
                <p className={styles.composerHelp}>
                  Selected prayer type: <strong>{effectiveTypeLabel}</strong>
                </p>
              ) : null}

              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(event) => setIsUrgent(event.target.checked)}
                />
                <span>Mark as urgent</span>
              </label>
            </section>
          ) : null}

          {step === 3 ? (
            <section className={styles.composerSection}>
              <p className={styles.privacyNote}>
                Share only what you are comfortable making public. Exact
                addresses are never required.
              </p>
              <p className={styles.sheetLabel}>Location privacy</p>
              <div className={styles.pillRow}>
                {(
                  [
                    { id: "none", label: "No location" },
                    { id: "country", label: "Country" },
                    { id: "state", label: "State / region" },
                    { id: "city", label: "City" },
                    { id: "approximate", label: "Approximate area" },
                    { id: "map-place", label: "Map place" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.pill} ${
                      locationMode === option.id ? styles.pillActive : ""
                    }`}
                    aria-pressed={locationMode === option.id}
                    onClick={() => {
                      setLocationMode(option.id);
                      setResolvedPlaceLabel(null);
                      setError(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {locationMode !== "none" ? (
                <>
                  <label className={styles.sheetLabel} htmlFor="prayer-location">
                    {locationMode === "country"
                      ? "Country"
                      : locationMode === "state"
                        ? "State or region"
                        : locationMode === "city"
                          ? "City"
                          : locationMode === "approximate"
                            ? "Approximate area"
                            : "Place to look up"}
                  </label>
                  <div className={styles.placeRow}>
                    <input
                      id="prayer-location"
                      className={styles.placeInput}
                      value={locationText}
                      placeholder={
                        locationMode === "map-place"
                          ? "e.g. Austin, Texas"
                          : "e.g. Texas"
                      }
                      onChange={(event) => {
                        setLocationText(event.target.value);
                        setResolvedPlaceLabel(null);
                      }}
                    />
                    {locationMode === "map-place" ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={placeResolving}
                        onClick={resolveMapPlace}
                      >
                        <MapPin className="h-4 w-4" aria-hidden />
                        {placeResolving ? "Looking up…" : "Look up"}
                      </button>
                    ) : null}
                  </div>
                  {resolvedPlaceLabel ? (
                    <p className={styles.centerLabel}>
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {resolvedPlaceLabel}
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {step === 4 ? (
            <section className={styles.composerSection}>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={allowEncouragement}
                  onChange={(event) =>
                    setAllowEncouragement(event.target.checked)
                  }
                />
                <span>Allow encouragement messages</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={allowPublicVideo}
                  onChange={(event) => setAllowPublicVideo(event.target.checked)}
                />
                <span>Allow public video prayers</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={allowPrivateMessage}
                  onChange={(event) =>
                    setAllowPrivateMessage(event.target.checked)
                  }
                />
                <span>Allow private messages</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={allowPrivateVideo}
                  onChange={(event) => setAllowPrivateVideo(event.target.checked)}
                />
                <span>Allow private video prayers</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={allowSharing}
                  onChange={(event) => setAllowSharing(event.target.checked)}
                />
                <span>Allow sharing</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={postAnonymous}
                  onChange={(event) => setPostAnonymous(event.target.checked)}
                />
                <span>Post as Anonymous</span>
              </label>
              <label className={styles.composerToggle}>
                <input
                  type="checkbox"
                  checked={receiveUpdates}
                  onChange={(event) => setReceiveUpdates(event.target.checked)}
                />
                <span>Receive updates when people pray</span>
              </label>
              <p className={styles.privacyNote}>
                Named posts use your profile display name when available.
                Anonymous posts appear as “Anonymous.”
              </p>
            </section>
          ) : null}

          {step === 5 ? (
            <section className={styles.composerSection}>
              <article className={styles.composerPreviewCard}>
                <div className={styles.composerPreviewMedia}>
                  {mediaPreviewUrl && mediaKind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreviewUrl} alt="" />
                  ) : mediaPreviewUrl && mediaKind === "video" ? (
                    <video
                      className={styles.composerPreviewVideo}
                      src={mediaPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className={styles.composerPreviewTextFallback}>
                      <span className={styles.cardCategoryChip}>
                        {categoryLabel}
                      </span>
                      <p>{title.trim() || "Prayer request"}</p>
                    </div>
                  )}
                  {isUrgent ? (
                    <span className={styles.cardUrgent}>
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Urgent
                    </span>
                  ) : null}
                </div>
                <div className={styles.composerPreviewBody}>
                  <h3>{title.trim() || "Prayer request"}</h3>
                  <p className={styles.cardMeta}>
                    {[
                      postAnonymous ? "Anonymous" : "Named",
                      locationPreview,
                      categoryLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className={styles.composerPreviewDescription}>
                    {description.trim()}
                  </p>
                  <ul className={styles.composerPreviewFlags}>
                    {allowEncouragement ? <li>Encouragement on</li> : null}
                    {allowPublicVideo ? <li>Public video prayers on</li> : null}
                    {allowSharing ? <li>Sharing on</li> : null}
                    {receiveUpdates ? <li>Updates on</li> : null}
                  </ul>
                </div>
              </article>

              {sensitiveFindings.length > 0 ? (
                <div className={styles.privacyWarning} role="status">
                  <p>
                    This looks like it may include sensitive personal
                    information ({sensitiveFindings.join(", ")}). Consider
                    removing it before publishing.
                  </p>
                  <label className={styles.composerToggle}>
                    <input
                      type="checkbox"
                      checked={sensitiveAck}
                      onChange={(event) =>
                        setSensitiveAck(event.target.checked)
                      }
                    />
                    <span>I understand and want to continue</span>
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 6 ? (
            <section className={styles.composerSection}>
              <div className={styles.composerPublishPanel}>
                <CheckCircle2
                  className="h-8 w-8"
                  style={{ color: "#0b63ce" }}
                  aria-hidden
                />
                <h3>Ready to publish</h3>
                <p>
                  Your request will be saved as a Prayer Request
                  {isUrgent ? " marked urgent" : ""}. Matching share-your-story,
                  it goes live if review clears it, otherwise it waits for
                  approval.
                </p>
                {publishMessage ? (
                  <p className={styles.centerLabel}>{publishMessage}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {error ? <p className={styles.errorText}>{error}</p> : null}
        </div>

        <footer className={styles.composerFooter}>
          {step > 1 ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={publishing}
              onClick={goBack}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={publishing}
              onClick={onClose}
            >
              Cancel
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={goNext}
            >
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={publishing}
              onClick={() => handlePublish()}
            >
              {publishing ? "Publishing…" : "Publish prayer"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

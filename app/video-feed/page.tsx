"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Captions,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  Globe2,
  HandHeart,
  HeartHandshake,
  MessageCircleHeart,
  MoreVertical,
  Pause,
  Play,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";
type VideoLanguage = "spanish" | "english";
type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient";
type CaptionFont =
  | "htbf-clean"
  | "bold-testimony"
  | "soft-scripture"
  | "praise-handwritten"
  | "modern-serif";
type CaptionColor =
  | "white"
  | "deep-navy"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green";
type CaptionSize = "small" | "medium" | "large" | "extra-large";

type ReportReason =
  | "inappropriate"
  | "harassment_hate"
  | "violence_harm"
  | "sexual_content"
  | "spam_scam"
  | "copyright"
  | "privacy"
  | "not_aligned"
  | "other";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  caption_style: CaptionStyle | null;
  video_url: string | null;
  status: string | null;
  created_at: string | null;
  prayer_status?: string | null;
  answered_at?: string | null;
  answered_text?: string | null;
};

type ReactionRow = {
  story_id: string | null;
  user_id: string | null;
  reaction_type: string | null;
};

type VideoReplyRow = {
  story_id: string | null;
};

type VideoStory = StoryRow & {
  signed_video_url: string | null;
  reaction_counts: {
    amen: number;
    praise_god: number;
    encouraged: number;
    praying: number;
  };
  user_reactions: ReactionType[];
  reply_count: number;
};

type VideoFeedCopy = {
  loadingFeed: string;
  backToSearch: string;
  loadVideosError: string;
  unknownError: string;
  signInToReact: string;
  reactionRemoveError: string;
  reactionAddError: string;
  signInToRespond: string;
  writeResponseFirst: string;
  sendResponseError: string;
  responseSent: string;
  signInToRemove: string;
  removeOwnVideoOnly: string;
  removeVideoConfirm: string;
  removeVideoError: string;
  videoRemoved: string;
  signInToReport: string;
  reportSubmitError: string;
  reportSubmitted: string;
  shareTitle: string;
  shareWithTextPrefix: string;
  shareFallback: string;
  shareLinkCopied: string;
  noVideosTitle: string;
  noVideosBody: string;
  moreOptions: string;
  exitBeStill: string;
  amen: string;
  prayNow: string;
  praise: string;
  respond: string;
  replyEyebrow: string;
  replyTitle: string;
  closeResponseBox: string;
  replyPlaceholder: string;
  sending: string;
  sendResponse: string;
  reportEyebrow: string;
  reportTitle: string;
  reportBody: string;
  closeReportBox: string;
  reportQuestion: string;
  reportDetailsLabel: string;
  reportDetailsPlaceholder: string;
  submitting: string;
  submitReport: string;
  videoOptions: string;
  beStillMode: string;
  playbackSpeed: string;
  language: string;
  captionsComingSoon: string;
  share: string;
  report: string;
  removeVideo: string;
  loadingVideo: string;
  playVideo: string;
  pauseVideo: string;
  turnSoundOff: string;
  turnSoundOn: string;
  zoom: string;
  showVideoDetails: string;
  hideVideoDetails: string;
  community: string;
  videoTestimony: string;
  sharedBy: string;
  prayerCircle: string;
  personPraying: string;
  peoplePraying: string;
  more: string;
  videoDetails: string;
  closeVideoDetails: string;
  languageSelected: string;
  testimonyTranslationComingSoon: string;
};

const videoFeedCopy: Record<VideoLanguage, VideoFeedCopy> = {
  english: {
    loadingFeed: "Loading video feed...",
    backToSearch: "Back to search",
    loadVideosError: "Could not load videos",
    unknownError: "Unknown error",
    signInToReact: "Please sign in to react.",
    reactionRemoveError: "Could not remove reaction",
    reactionAddError: "Could not add reaction",
    signInToRespond: "Please sign in to respond.",
    writeResponseFirst: "Please write a response first.",
    sendResponseError: "Could not send response",
    responseSent: "Response sent.",
    signInToRemove: "Please sign in to remove your video.",
    removeOwnVideoOnly: "You can only remove your own videos.",
    removeVideoConfirm:
      "Remove this video from HTBF? It will no longer appear in the video feed, search, or your public posts.",
    removeVideoError: "Could not remove video",
    videoRemoved: "Video removed from public view.",
    signInToReport: "Please sign in to report a video.",
    reportSubmitError: "Could not submit report",
    reportSubmitted: "Report submitted. Thank you for helping keep HTBF safe.",
    shareTitle: "HTBF Video Testimony",
    shareWithTextPrefix: "Watch this video testimony",
    shareFallback: "Watch this video testimony on Hyper to Be Free.",
    shareLinkCopied: "Share link copied.",
    noVideosTitle: "No videos yet",
    noVideosBody: "Approved video testimonies will appear here after review.",
    moreOptions: "More video options",
    exitBeStill: "Tap to Exit Be Still Mode",
    amen: "Amén",
    prayNow: "Pray Now",
    praise: "Praise",
    respond: "Respond",
    replyEyebrow: "Respond with encouragement",
    replyTitle: "Send a message",
    closeResponseBox: "Close response box",
    replyPlaceholder: "Write a kind response, prayer, or encouragement...",
    sending: "Sending...",
    sendResponse: "Send Response",
    reportEyebrow: "Report Video",
    reportTitle: "Flag for moderator review",
    reportBody:
      "Reports help keep HTBF safe. This does not automatically remove the video, but it sends it to the admin review queue.",
    closeReportBox: "Close report box",
    reportQuestion: "Why are you reporting this?",
    reportDetailsLabel: "Details, optional",
    reportDetailsPlaceholder: "Add any details that may help the moderator...",
    submitting: "Submitting...",
    submitReport: "Submit Report",
    videoOptions: "Video Options",
    beStillMode: "Be Still Mode",
    playbackSpeed: "Playback Speed",
    language: "Language",
    captionsComingSoon: "Captions coming soon",
    share: "Share",
    report: "Report",
    removeVideo: "Remove Video",
    loadingVideo: "Loading video",
    playVideo: "Play video",
    pauseVideo: "Pause video",
    turnSoundOff: "Turn sound off",
    turnSoundOn: "Turn sound on",
    zoom: "Zoom",
    showVideoDetails: "Show video details",
    hideVideoDetails: "Hide video details",
    community: "HTBF Community",
    videoTestimony: "Video Testimony",
    sharedBy: "Shared by",
    prayerCircle: "Prayer Circle",
    personPraying: "1 person praying",
    peoplePraying: "people praying",
    more: "More",
    videoDetails: "Video Details",
    closeVideoDetails: "Close video details",
    languageSelected: "English selected.",
    testimonyTranslationComingSoon: "Testimony translation support coming soon.",
  },
  spanish: {
    loadingFeed: "Cargando videos...",
    backToSearch: "Volver a la búsqueda",
    loadVideosError: "No se pudieron cargar los videos",
    unknownError: "Error desconocido",
    signInToReact: "Inicia sesión para reaccionar.",
    reactionRemoveError: "No se pudo quitar la reacción",
    reactionAddError: "No se pudo agregar la reacción",
    signInToRespond: "Inicia sesión para responder.",
    writeResponseFirst: "Escribe una respuesta primero.",
    sendResponseError: "No se pudo enviar la respuesta",
    responseSent: "Respuesta enviada.",
    signInToRemove: "Inicia sesión para quitar tu video.",
    removeOwnVideoOnly: "Solo puedes quitar tus propios videos.",
    removeVideoConfirm:
      "¿Quitar este video de HTBF? Ya no aparecerá en el feed de videos, la búsqueda ni tus publicaciones públicas.",
    removeVideoError: "No se pudo quitar el video",
    videoRemoved: "Video quitado de la vista pública.",
    signInToReport: "Inicia sesión para reportar un video.",
    reportSubmitError: "No se pudo enviar el reporte",
    reportSubmitted: "Reporte enviado. Gracias por ayudar a cuidar HTBF.",
    shareTitle: "Testimonio en video de HTBF",
    shareWithTextPrefix: "Mira este testimonio en video",
    shareFallback: "Mira este testimonio en video en Hyper to Be Free.",
    shareLinkCopied: "Enlace copiado.",
    noVideosTitle: "Aún no hay videos",
    noVideosBody:
      "Los testimonios en video aprobados aparecerán aquí después de la revisión.",
    moreOptions: "Más opciones de video",
    exitBeStill: "Toca para salir del modo quietud",
    amen: "Amen",
    prayNow: "Orar ahora",
    praise: "Alabanza",
    respond: "Responder",
    replyEyebrow: "Responde con ánimo",
    replyTitle: "Enviar un mensaje",
    closeResponseBox: "Cerrar respuesta",
    replyPlaceholder: "Escribe una respuesta amable, oración o ánimo...",
    sending: "Enviando...",
    sendResponse: "Enviar respuesta",
    reportEyebrow: "Reportar video",
    reportTitle: "Enviar a revisión",
    reportBody:
      "Los reportes ayudan a cuidar HTBF. Esto no quita el video automáticamente, pero lo envía a la cola de revisión del administrador.",
    closeReportBox: "Cerrar reporte",
    reportQuestion: "¿Por qué reportas esto?",
    reportDetailsLabel: "Detalles, opcional",
    reportDetailsPlaceholder:
      "Agrega cualquier detalle que pueda ayudar al moderador...",
    submitting: "Enviando...",
    submitReport: "Enviar reporte",
    videoOptions: "Opciones de video",
    beStillMode: "Modo quietud",
    playbackSpeed: "Velocidad",
    language: "Idioma",
    captionsComingSoon: "Subtítulos próximamente",
    share: "Compartir",
    report: "Reportar",
    removeVideo: "Quitar video",
    loadingVideo: "Cargando video",
    playVideo: "Reproducir video",
    pauseVideo: "Pausar video",
    turnSoundOff: "Apagar sonido",
    turnSoundOn: "Activar sonido",
    zoom: "Zoom",
    showVideoDetails: "Mostrar detalles del video",
    hideVideoDetails: "Ocultar detalles del video",
    community: "Comunidad HTBF",
    videoTestimony: "Testimonio en video",
    sharedBy: "Compartido por",
    prayerCircle: "Círculo de oración",
    personPraying: "1 persona orando",
    peoplePraying: "personas orando",
    more: "Más",
    videoDetails: "Detalles del video",
    closeVideoDetails: "Cerrar detalles del video",
    languageSelected: "Español seleccionado.",
    testimonyTranslationComingSoon:
      "La traducción de testimonios llegará pronto.",
  },
};

const reportReasons: {
  labels: Record<VideoLanguage, string>;
  value: ReportReason;
}[] = [
  {
    labels: {
      english: "Inappropriate content",
      spanish: "Contenido inapropiado",
    },
    value: "inappropriate",
  },
  {
    labels: { english: "Harassment or hate", spanish: "Acoso u odio" },
    value: "harassment_hate",
  },
  {
    labels: {
      english: "Violence or harmful content",
      spanish: "Violencia o contenido dañino",
    },
    value: "violence_harm",
  },
  {
    labels: { english: "Sexual content", spanish: "Contenido sexual" },
    value: "sexual_content",
  },
  {
    labels: { english: "Spam or scam", spanish: "Spam o estafa" },
    value: "spam_scam",
  },
  {
    labels: { english: "Copyright issue", spanish: "Problema de copyright" },
    value: "copyright",
  },
  {
    labels: { english: "Privacy concern", spanish: "Privacidad" },
    value: "privacy",
  },
  {
    labels: {
      english: "Not aligned with HTBF community",
      spanish: "No alineado con la comunidad HTBF",
    },
    value: "not_aligned",
  },
  { labels: { english: "Other", spanish: "Otro" }, value: "other" },
];

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
const prayerCircleJoinedMessage = "You joined the Prayer Circle.";

const languageOptions: { label: string; value: VideoLanguage }[] = [
  { label: "Español", value: "spanish" },
  { label: "English", value: "english" },
];

export default function VideoFeedPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<VideoStory[]>([]);
  const [message, setMessage] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const [replyStory, setReplyStory] = useState<VideoStory | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [reportStory, setReportStory] = useState<VideoStory | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const [soundOn, setSoundOn] = useState(false);
  const [beStillMode, setBeStillMode] = useState(false);
  const [optionsStoryId, setOptionsStoryId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedLanguage, setSelectedLanguage] =
    useState<VideoLanguage>("english");
  const copy = videoFeedCopy[selectedLanguage];

  useEffect(() => {
    if (!message) return;

    const timeout = message === prayerCircleJoinedMessage ? 2000 : 2500;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, timeout);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    let currentUserId: string | null = null;

    async function loadPage() {
      setCheckingUser(true);
      setMessage("");

      const params = new URLSearchParams(window.location.search);
      setSelectedStoryId(params.get("story"));

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      currentUserId = user.id;
      setUserId(user.id);

      await loadVideoStories(user.id);
      setCheckingUser(false);
    }

    loadPage();

    const channel = supabase
      .channel("video-feed-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_reactions" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_video_replies" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        async () => {
          await loadVideoStories(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function getVideoStoragePath(videoUrl: string | null) {
    if (!videoUrl) return null;

    if (videoUrl.includes("story-videos/")) {
      const afterBucket = videoUrl.split("story-videos/")[1];
      const pathOnly = afterBucket.split("?")[0];

      return decodeURIComponent(pathOnly);
    }

    if (videoUrl.startsWith("http")) {
      return null;
    }

    return videoUrl;
  }

  function getCaptionStyle(value: string | null | undefined): CaptionStyle {
    if (
      value === "classic-caption" ||
      value === "bold-center" ||
      value === "bottom-banner" ||
      value === "highlight-box" ||
      value === "scripture-card" ||
      value === "praise-glow" ||
      value === "testimony-quote" ||
      value === "minimal-white" ||
      value === "black-outline" ||
      value === "soft-gradient"
    ) {
      return value;
    }

    return "classic-caption";
  }

  async function loadVideoStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, caption_style, video_url, status, created_at, prayer_status, answered_at, answered_text"
      )
      .eq("status", "approved")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error || !data) {
      setMessage(
        `${copy.loadVideosError}: ${error?.message ?? copy.unknownError}`
      );
      return;
    }

    const storyIds = data.map((story) => story.id);

    let reactions: ReactionRow[] = [];
    let replies: VideoReplyRow[] = [];

    if (storyIds.length > 0) {
      const { data: reactionData } = await supabase
        .from("story_reactions")
        .select("story_id, user_id, reaction_type")
        .in("story_id", storyIds);

      reactions = (reactionData as ReactionRow[]) ?? [];

      const { data: replyData } = await supabase
        .from("story_video_replies")
        .select("story_id")
        .in("story_id", storyIds);

      replies = (replyData as VideoReplyRow[]) ?? [];
    }

    const nextStories: VideoStory[] = await Promise.all(
      (data as StoryRow[]).map(async (story) => {
        let signedVideoUrl: string | null = null;

        if (story.video_url) {
          const storagePath = getVideoStoragePath(story.video_url);

          if (storagePath) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("story-videos")
                .createSignedUrl(storagePath, 60 * 60);

            if (signedError) {
              console.error("Could not create signed video URL:", signedError);
            }

            signedVideoUrl = signedData?.signedUrl ?? null;
          } else if (story.video_url.startsWith("http")) {
            signedVideoUrl = story.video_url;
          }
        }

        const storyReactions = reactions.filter(
          (reaction) => reaction.story_id === story.id
        );

        const storyReplies = replies.filter(
          (reply) => reply.story_id === story.id
        );

        const userReactions = storyReactions
          .filter((reaction) => reaction.user_id === currentUserId)
          .map((reaction) => reaction.reaction_type)
          .filter(
            (reaction): reaction is ReactionType =>
              reaction === "amen" ||
              reaction === "praise_god" ||
              reaction === "encouraged" ||
              reaction === "praying"
          );

        return {
          ...story,
          caption_style: getCaptionStyle(story.caption_style),
          signed_video_url: signedVideoUrl,
          reaction_counts: {
            amen: storyReactions.filter(
              (reaction) => reaction.reaction_type === "amen"
            ).length,
            praise_god: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praise_god"
            ).length,
            encouraged: storyReactions.filter(
              (reaction) => reaction.reaction_type === "encouraged"
            ).length,
            praying: storyReactions.filter(
              (reaction) => reaction.reaction_type === "praying"
            ).length,
          },
          user_reactions: userReactions,
          reply_count: storyReplies.length,
        };
      })
    );

    setStories(nextStories);
  }

  const orderedStories = useMemo(() => {
    if (!selectedStoryId) return stories;

    const selected = stories.find((story) => story.id === selectedStoryId);
    const rest = stories.filter((story) => story.id !== selectedStoryId);

    return selected ? [selected, ...rest] : stories;
  }, [stories, selectedStoryId]);

  async function toggleReaction(storyId: string, reactionType: ReactionType) {
    setMessage("");

    if (!userId) {
      setMessage(copy.signInToReact);
      return;
    }

    const story = stories.find((item) => item.id === storyId);
    const alreadyReacted = story?.user_reactions.includes(reactionType);

    if (alreadyReacted) {
      const { error } = await supabase
        .from("story_reactions")
        .delete()
        .eq("story_id", storyId)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);

      if (error) {
        setMessage(`${copy.reactionRemoveError}: ${error.message}`);
        return;
      }

      updateLocalReaction(storyId, reactionType, "remove");
      return;
    }

    const { error } = await supabase.from("story_reactions").insert({
      story_id: storyId,
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      setMessage(`${copy.reactionAddError}: ${error.message}`);
      return;
    }

    updateLocalReaction(storyId, reactionType, "add");

    if (reactionType === "praying") {
      setMessage(prayerCircleJoinedMessage);
    }
  }

  function updateLocalReaction(
    storyId: string,
    reactionType: ReactionType,
    action: "add" | "remove"
  ) {
    setStories((currentStories) =>
      currentStories.map((story) => {
        if (story.id !== storyId) return story;

        const nextCount =
          action === "add"
            ? story.reaction_counts[reactionType] + 1
            : Math.max(story.reaction_counts[reactionType] - 1, 0);

        const nextUserReactions =
          action === "add"
            ? [...story.user_reactions, reactionType]
            : story.user_reactions.filter(
                (reaction) => reaction !== reactionType
              );

        return {
          ...story,
          reaction_counts: {
            ...story.reaction_counts,
            [reactionType]: nextCount,
          },
          user_reactions: nextUserReactions,
        };
      })
    );
  }

  async function sendVideoReply() {
    if (!userId || !replyStory) {
      setMessage(copy.signInToRespond);
      return;
    }

    const cleanReply = replyText.trim();

    if (!cleanReply) {
      setMessage(copy.writeResponseFirst);
      return;
    }

    setSendingReply(true);
    setMessage("");

    const { error } = await supabase.from("story_video_replies").insert({
      story_id: replyStory.id,
      user_id: userId,
      recipient_user_id: replyStory.user_id,
      message: cleanReply,
    });

    if (error) {
      setMessage(`${copy.sendResponseError}: ${error.message}`);
      setSendingReply(false);
      return;
    }

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === replyStory.id
          ? {
              ...story,
              reply_count: story.reply_count + 1,
            }
          : story
      )
    );

    setReplyText("");
    setReplyStory(null);
    setSendingReply(false);
    setMessage(copy.responseSent);
  }

  async function removeMyVideo(story: VideoStory) {
    setMessage("");

    if (!userId) {
      setMessage(copy.signInToRemove);
      return;
    }

    if (story.user_id !== userId) {
      setMessage(copy.removeOwnVideoOnly);
      return;
    }

    const confirmed = window.confirm(copy.removeVideoConfirm);

    if (!confirmed) return;

    const { error } = await supabase.rpc("remove_my_video_story", {
      story_id: story.id,
    });

    if (error) {
      setMessage(`${copy.removeVideoError}: ${error.message}`);
      return;
    }

    setStories((currentStories) =>
      currentStories.filter((item) => item.id !== story.id)
    );

    if (selectedStoryId === story.id) {
      setSelectedStoryId(null);
    }

    if (replyStory?.id === story.id) {
      setReplyStory(null);
      setReplyText("");
    }

    setMessage(copy.videoRemoved);
  }

  function openReportModal(story: VideoStory) {
    setReportStory(story);
    setReportReason("inappropriate");
    setReportDetails("");
    setMessage("");
  }

  async function submitReport() {
    if (!userId || !reportStory) {
      setMessage(copy.signInToReport);
      return;
    }

    setSendingReport(true);
    setMessage("");

    const cleanDetails = reportDetails.trim();

    const { error } = await supabase.from("content_reports").insert({
      story_id: reportStory.id,
      reporter_user_id: userId,
      reported_user_id: reportStory.user_id,
      reason: reportReason,
      details: cleanDetails || null,
      status: "open",
    });

    setSendingReport(false);

    if (error) {
      setMessage(`${copy.reportSubmitError}: ${error.message}`);
      return;
    }

    setReportStory(null);
    setReportReason("inappropriate");
    setReportDetails("");
    setMessage(copy.reportSubmitted);
  }

  async function shareStory(story: VideoStory) {
    setMessage("");

    const shareText = story.story_text
      ? `${copy.shareWithTextPrefix}: ${story.story_text.slice(0, 140)}`
      : copy.shareFallback;

    const shareUrl = `${window.location.origin}/video-feed?story=${story.id}&from=share`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: copy.shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setMessage(copy.shareLinkCopied);
    } catch (error) {
      console.error("Share failed:", error);
    }
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-black px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white/10 p-8">
          {copy.loadingFeed}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      {!beStillMode && (
        <div className="fixed left-4 top-4 z-50">
          <Link
            href="/search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            aria-label={copy.backToSearch}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
      )}

      {message && !beStillMode && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-sm font-black text-slate-900 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          {message}
        </div>
      )}

      {orderedStories.length === 0 ? (
        <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
          <div>
            <Video className="mx-auto mb-4 h-10 w-10 text-white/70" />
            <div className="text-xl font-black">{copy.noVideosTitle}</div>
            <p className="mt-2 text-sm text-white/60">
              {copy.noVideosBody}
            </p>
          </div>
        </div>
      ) : (
        <section className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
          {orderedStories.map((story, index) => {
            if (!story.signed_video_url) return null;

            const isOwner = Boolean(userId && story.user_id === userId);

            return (
              <article
                key={story.id}
                className="relative flex h-[100dvh] snap-start items-center justify-center overflow-hidden bg-black"
              >
                <AutoPlayReelVideo
                  videoUrl={story.signed_video_url}
                  soundOn={soundOn}
                  onSoundChange={setSoundOn}
                  eagerLoad={index === 0}
                  beStillMode={beStillMode}
                  playbackRate={playbackRate}
                  copy={copy}
                />

                {!beStillMode && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOptionsStoryId((currentStoryId) =>
                        currentStoryId === story.id ? null : story.id
                      );
                    }}
                    className="absolute right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
                    aria-label={copy.moreOptions}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                )}

                {optionsStoryId === story.id && !beStillMode && (
                  <VideoOptionsMenu
                    isOwner={isOwner}
                    playbackRate={playbackRate}
                    setPlaybackRate={setPlaybackRate}
                    selectedLanguage={selectedLanguage}
                    onLanguageSelect={(language) => {
                      const nextCopy = videoFeedCopy[language];

                      setSelectedLanguage(language);
                      setMessage(
                        language === "spanish"
                          ? `${nextCopy.languageSelected} ${nextCopy.testimonyTranslationComingSoon}`
                          : nextCopy.languageSelected
                      );
                    }}
                    copy={copy}
                    onBeStill={() => {
                      setOptionsStoryId(null);
                      setBeStillMode(true);
                    }}
                    onShare={() => {
                      setOptionsStoryId(null);
                      shareStory(story);
                    }}
                    onReport={() => {
                      setOptionsStoryId(null);
                      openReportModal(story);
                    }}
                    onRemove={() => {
                      setOptionsStoryId(null);
                      removeMyVideo(story);
                    }}
                    onClose={() => setOptionsStoryId(null)}
                  />
                )}

                {!beStillMode && (
                  <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex flex-col items-center gap-3">
                    <VideoActionButton
                      label={copy.amen}
                      count={story.reaction_counts.amen}
                      active={story.user_reactions.includes("amen")}
                      onClick={() => toggleReaction(story.id, "amen")}
                      icon={<HeartHandshake className="h-5 w-5" />}
                    />

                    <VideoActionButton
                      label={
                        story.user_reactions.includes("praying")
                          ? "Praying"
                          : copy.prayNow
                      }
                      count={story.reaction_counts.praying}
                      active={story.user_reactions.includes("praying")}
                      onClick={() => toggleReaction(story.id, "praying")}
                      icon={<HandHeart className="h-5 w-5" />}
                    />

                    <VideoActionButton
                      label={copy.praise}
                      count={story.reaction_counts.praise_god}
                      active={story.user_reactions.includes("praise_god")}
                      onClick={() => toggleReaction(story.id, "praise_god")}
                      icon={<Sparkles className="h-5 w-5" />}
                    />

                    <VideoActionButton
                      label={copy.respond}
                      count={story.reply_count}
                      active={false}
                      onClick={() => {
                        setReplyStory(story);
                        setReplyText("");
                        setMessage("");
                      }}
                      icon={<MessageCircleHeart className="h-5 w-5" />}
                    />
                  </div>
                )}

                {!beStillMode && <VideoInfoOverlay story={story} copy={copy} />}

                {beStillMode && (
                  <button
                    type="button"
                    onClick={() => setBeStillMode(false)}
                    className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/35 px-4 py-2 text-xs font-black text-white/80 backdrop-blur"
                  >
                    {copy.exitBeStill}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {replyStory && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  {copy.replyEyebrow}
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  {copy.replyTitle}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReplyStory(null);
                  setReplyText("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label={copy.closeResponseBox}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={5}
              placeholder={copy.replyPlaceholder}
              className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              disabled={sendingReply}
              onClick={sendVideoReply}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingReply ? copy.sending : copy.sendResponse}
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {reportStory && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                  {copy.reportEyebrow}
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  {copy.reportTitle}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {copy.reportBody}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReportStory(null);
                  setReportReason("inappropriate");
                  setReportDetails("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label={copy.closeReportBox}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                {copy.reportQuestion}
              </div>

              <select
                value={reportReason}
                onChange={(event) =>
                  setReportReason(event.target.value as ReportReason)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              >
                {reportReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.labels[selectedLanguage]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                {copy.reportDetailsLabel}
              </div>

              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                rows={4}
                placeholder={copy.reportDetailsPlaceholder}
                className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <button
              type="button"
              disabled={sendingReport}
              onClick={submitReport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingReport ? copy.submitting : copy.submitReport}
              <Flag className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function VideoOptionsMenu({
  isOwner,
  playbackRate,
  setPlaybackRate,
  selectedLanguage,
  onLanguageSelect,
  copy,
  onBeStill,
  onShare,
  onReport,
  onRemove,
  onClose,
}: {
  isOwner: boolean;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  selectedLanguage: VideoLanguage;
  onLanguageSelect: (language: VideoLanguage) => void;
  copy: VideoFeedCopy;
  onBeStill: () => void;
  onShare: () => void;
  onReport: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-4 top-16 z-[70] w-72 rounded-[2rem] bg-white/95 p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-black text-[#062a57]">
          {copy.videoOptions}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onBeStill}
        className="mb-3 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        <EyeOff className="h-4 w-4" />
        {copy.beStillMode}
      </button>

      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <Gauge className="h-4 w-4" />
        {copy.playbackSpeed}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {playbackSpeeds.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setPlaybackRate(speed)}
            className={`rounded-xl px-2 py-2 text-xs font-black ${
              playbackRate === speed
                ? "bg-[#0b63ce] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        <Globe2 className="h-4 w-4" />
        {copy.language}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {languageOptions.map((language) => (
          <button
            key={language.value}
            type="button"
            onClick={() => onLanguageSelect(language.value)}
            aria-pressed={selectedLanguage === language.value}
            className={`rounded-xl px-2 py-2 text-xs font-black ${
              selectedLanguage === language.value
                ? "bg-[#0b63ce] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
            }`}
          >
            {language.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="mb-3 flex w-full cursor-not-allowed items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-400"
      >
        <Captions className="h-4 w-4" />
        {copy.captionsComingSoon}
      </button>

      <button
        type="button"
        onClick={onShare}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        <Share2 className="h-4 w-4" />
        {copy.share}
      </button>

      <button
        type="button"
        onClick={onReport}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-red-50 px-3 py-3 text-sm font-black text-red-700 hover:bg-red-100"
      >
        <Flag className="h-4 w-4" />
        {copy.report}
      </button>

      {isOwner && (
        <button
          type="button"
          onClick={onRemove}
          className="flex w-full items-center gap-2 rounded-2xl bg-red-600 px-3 py-3 text-sm font-black text-white hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" />
          {copy.removeVideo}
        </button>
      )}
    </div>
  );
}

function AutoPlayReelVideo({
  videoUrl,
  soundOn,
  onSoundChange,
  eagerLoad,
  beStillMode,
  playbackRate,
  copy,
}: {
  videoUrl: string;
  soundOn: boolean;
  onSoundChange: (nextValue: boolean) => void;
  eagerLoad: boolean;
  beStillMode: boolean;
  playbackRate: number;
  copy: VideoFeedCopy;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(eagerLoad);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const wheelZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPausedRef = useRef(false);
  const pointerInsideRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) return;

    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadVideo(true);
        }
      },
      {
        rootMargin: "700px 0px",
        threshold: 0.01,
      }
    );

    loadObserver.observe(wrapper);

    return () => {
      loadObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;

    if (!wrapper || !video || !shouldLoadVideo) return;

    video.muted = !soundOn;
    video.playsInline = true;
    video.playbackRate = playbackRate;

    const playObserver = new IntersectionObserver(
      ([entry]) => {
        if (!video) return;

        const isMostlyVisible =
          entry.isIntersecting && entry.intersectionRatio >= 0.65;

        if (isMostlyVisible) {
          if (!userPaused) {
            video.muted = !soundOn;
            video.playbackRate = playbackRate;

            video
              .play()
              .then(() => {
                setPaused(false);
              })
              .catch(() => {
                video.muted = true;
                onSoundChange(false);

                video
                  .play()
                  .then(() => {
                    setPaused(false);
                  })
                  .catch(() => setPaused(true));
              });
          }
        } else {
          video.pause();
          setPaused(true);
        }
      },
      {
        threshold: [0, 0.25, 0.65, 1],
      }
    );

    playObserver.observe(wrapper);

    return () => {
      playObserver.disconnect();
      video.pause();
    };
  }, [
    videoUrl,
    soundOn,
    userPaused,
    shouldLoadVideo,
    onSoundChange,
    playbackRate,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    video.muted = !soundOn;

    if (soundOn) {
      video.volume = 1;
    }
  }, [soundOn]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) return;

    function getDistance(touches: TouchList) {
      const firstTouch = touches[0];
      const secondTouch = touches[1];

      const xDistance = firstTouch.clientX - secondTouch.clientX;
      const yDistance = firstTouch.clientY - secondTouch.clientY;

      return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinchStartDistanceRef.current = getDistance(event.touches);
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length === 2 && pinchStartDistanceRef.current) {
        event.preventDefault();

        const currentDistance = getDistance(event.touches);
        const rawScale = currentDistance / pinchStartDistanceRef.current;
        const limitedScale = Math.min(Math.max(rawScale, 1), 3);

        setZoomScale(limitedScale);
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) {
        pinchStartDistanceRef.current = null;
        setZoomScale(1);
      }
    }

    function handlePointerEnter() {
      pointerInsideRef.current = true;
    }

    function handlePointerLeave() {
      pointerInsideRef.current = false;
      setZoomScale(1);
      releaseHoldPause();
    }

    wrapper.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    wrapper.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    wrapper.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });
    wrapper.addEventListener("touchcancel", handleTouchEnd, {
      passive: false,
    });
    wrapper.addEventListener("pointerenter", handlePointerEnter);
    wrapper.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      wrapper.removeEventListener("touchstart", handleTouchStart);
      wrapper.removeEventListener("touchmove", handleTouchMove);
      wrapper.removeEventListener("touchend", handleTouchEnd);
      wrapper.removeEventListener("touchcancel", handleTouchEnd);
      wrapper.removeEventListener("pointerenter", handlePointerEnter);
      wrapper.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    function handleWheelZoom(event: WheelEvent) {
      const wrapper = wrapperRef.current;

      if (!wrapper) return;

      const target = event.target as Node | null;
      const eventStartedInsideVideo = target ? wrapper.contains(target) : false;
      const isTrackpadPinchOrBrowserZoom = event.ctrlKey || event.metaKey;

      if (!eventStartedInsideVideo && !pointerInsideRef.current) return;
      if (!isTrackpadPinchOrBrowserZoom) return;

      event.preventDefault();
      event.stopPropagation();

      setZoomScale((currentScale) => {
        const zoomChange = event.deltaY < 0 ? 0.12 : -0.12;
        const nextScale = currentScale + zoomChange;

        return Math.min(Math.max(nextScale, 1), 3);
      });

      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }

      wheelZoomTimeoutRef.current = setTimeout(() => {
        setZoomScale(1);
      }, 220);
    }

    window.addEventListener("wheel", handleWheelZoom, {
      passive: false,
      capture: true,
    });

    return () => {
      window.removeEventListener("wheel", handleWheelZoom, {
        capture: true,
      } as AddEventListenerOptions);

      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
    };
  }, []);

  function isControlClick(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(target.closest("button, a, textarea, input, select"));
  }

  function playVideo() {
    const video = videoRef.current;

    if (!video) return;

    video.muted = !soundOn;
    video.playbackRate = playbackRate;

    video
      .play()
      .then(() => {
        setPaused(false);
        setUserPaused(false);
      })
      .catch(() => {
        video.muted = true;
        onSoundChange(false);

        video
          .play()
          .then(() => {
            setPaused(false);
            setUserPaused(false);
          })
          .catch(() => setPaused(true));
      });
  }

  function pauseVideo(userIntent = true) {
    const video = videoRef.current;

    if (!video) return;

    video.pause();
    setPaused(true);

    if (userIntent) {
      setUserPaused(true);
    }
  }

  function togglePlayButton() {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      playVideo();
    } else {
      pauseVideo(true);
    }
  }

  function toggleSound() {
    const video = videoRef.current;

    if (!video) return;

    const nextSoundOn = !soundOn;

    onSoundChange(nextSoundOn);
    video.muted = !nextSoundOn;

    if (nextSoundOn) {
      video.volume = 1;
    }
  }

  function startHoldPause(target: EventTarget | null) {
    if (isControlClick(target)) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    holdPausedRef.current = false;

    holdTimerRef.current = setTimeout(() => {
      const video = videoRef.current;

      if (!video || video.paused) return;

      holdPausedRef.current = true;
      video.pause();
      setPaused(true);
    }, 220);
  }

  function releaseHoldPause() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (holdPausedRef.current) {
      holdPausedRef.current = false;
      playVideo();
    }
  }

  function handleWrapperClick(event: React.MouseEvent<HTMLDivElement>) {
    if (isControlClick(event.target)) return;
    if (holdPausedRef.current) return;

    togglePlayButton();
  }

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden bg-black [touch-action:pan-y]"
      onClick={handleWrapperClick}
      onPointerDown={(event) => startHoldPause(event.target)}
      onPointerUp={releaseHoldPause}
      onPointerCancel={releaseHoldPause}
      onMouseLeave={releaseHoldPause}
    >
      {shouldLoadVideo ? (
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          muted={!soundOn}
          loop
          playsInline
          preload="metadata"
          className="h-full w-full bg-black object-cover object-center transition-transform duration-150 ease-out will-change-transform md:mx-auto md:w-[min(100vw,78dvh)] md:max-w-full lg:w-[min(100vw,84dvh)]"
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: "center center",
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black text-xs font-black uppercase tracking-[0.18em] text-white/40">
          {copy.loadingVideo}
        </div>
      )}

      {!beStillMode && paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="flex items-center gap-4 rounded-full bg-black/45 px-5 py-4 backdrop-blur-md">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                togglePlayButton();
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-900 shadow-md"
              aria-label={paused ? copy.playVideo : copy.pauseVideo}
            >
              {paused ? (
                <Play className="h-6 w-6 fill-slate-900" />
              ) : (
                <Pause className="h-6 w-6 fill-slate-900" />
              )}
            </button>

            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggleSound();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md"
              aria-label={soundOn ? copy.turnSoundOff : copy.turnSoundOn}
            >
              {soundOn ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      )}

      {zoomScale > 1 && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-black text-white backdrop-blur">
          {copy.zoom} {zoomScale.toFixed(1)}x
        </div>
      )}
    </div>
  );
}

function VideoInfoOverlay({
  story,
  copy,
}: {
  story: VideoStory;
  copy: VideoFeedCopy;
}) {
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const rawStoryText = story.story_text?.trim() || "";
  const storyText = rawStoryText.toLowerCase() === "none" ? "" : rawStoryText;
  const captionStyle = story.caption_style ?? "classic-caption";
  const usesStyledCaption = Boolean(
    storyText && captionStyle !== "classic-caption"
  );
  const isLongText = storyText.length > 70;

  if (hidden) {
    return (
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setHidden(false);
        }}
        className="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/15 backdrop-blur-md"
        aria-label={copy.showVideoDetails}
        title={copy.showVideoDetails}
      >
        <Eye className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      {usesStyledCaption && (
        <VideoCaptionStyleOverlay style={captionStyle} text={storyText} />
      )}

      <div className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-0 z-30 w-[min(72vw,420px)] overflow-hidden bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4 pb-4">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setHidden(true);
          }}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 ring-1 ring-white/15 backdrop-blur-md"
          aria-label={copy.hideVideoDetails}
          title={copy.hideVideoDetails}
        >
          <EyeOff className="h-4 w-4" />
        </button>

        <div className="pointer-events-none max-w-full overflow-hidden">
          <div className="mb-1 flex min-w-0 items-center gap-2 text-xs font-bold text-white/85 md:text-sm">
            <Globe2 className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
            <span className="min-w-0 truncate">
              {story.location || copy.community}
            </span>
          </div>

          <div className="max-w-full truncate text-[10px] font-black uppercase tracking-[0.18em] text-blue-200 md:text-xs">
            {story.story_type || copy.videoTestimony}
          </div>

          {storyText && !usesStyledCaption && (
            <div className="relative mt-1.5 max-w-full overflow-hidden">
              <h1
                className="mt-1.5 line-clamp-3 max-w-full text-sm font-black leading-snug text-white md:text-base"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {storyText}
              </h1>
            </div>
          )}

          {story.name && (
            <p className="mt-1.5 max-w-full truncate text-xs font-bold text-white/70 md:text-sm">
              {copy.sharedBy} {story.name}
            </p>
          )}

          {story.reaction_counts.praying > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
              <HandHeart className="h-3.5 w-3.5" />
              {copy.prayerCircle} ·{" "}
              {story.reaction_counts.praying === 1
                ? copy.personPraying
                : `${story.reaction_counts.praying} ${copy.peoplePraying}`}
            </div>
          )}
        </div>

        {isLongText && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            className="mt-2 inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-900 shadow-md backdrop-blur md:text-xs"
          >
            {copy.more}
          </button>
        )}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[75dvh] w-full max-w-lg overflow-hidden rounded-[2rem] bg-white text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  {story.story_type || copy.videoTestimony}
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  {copy.videoDetails}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label={copy.closeVideoDetails}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[55dvh] overflow-y-auto p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500">
                <Globe2 className="h-4 w-4" />
                {story.location || copy.community}
              </div>

              <p
                className="whitespace-pre-line text-base font-bold leading-7 text-slate-800"
                style={{
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {storyText}
              </p>

              {story.name && (
                <p className="mt-5 text-sm font-bold text-slate-500">
                  {copy.sharedBy} {story.name}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VideoCaptionStyleOverlay({
  color,
  font,
  size,
  style,
  text,
}: {
  color?: CaptionColor;
  font?: CaptionFont;
  size?: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  // TODO: Pass caption_font, caption_color, and caption_size from stories when those columns exist.
  const positionClass = getVideoCaptionPositionClass(style);
  const styleClass = getVideoCaptionStyleClass(style);
  const fontClass = font ? getVideoCaptionFontClass(font) : "";
  const colorClass = color ? getVideoCaptionColorClass(color) : "";
  const sizeClass = getVideoCaptionSizeClass(size);
  const textShadow = color ? getVideoCaptionTextShadow(color) : undefined;
  const quoteText = style === "testimony-quote" ? `“${text}”` : text;

  return (
    <div
      className={`pointer-events-none absolute z-30 max-h-36 w-[min(80vw,520px)] overflow-hidden whitespace-pre-wrap break-words px-4 py-3 leading-snug shadow-lg sm:max-h-44 md:w-[min(64vw,560px)] ${sizeClass} ${positionClass} ${styleClass} ${fontClass} ${colorClass}`}
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        textShadow,
      }}
    >
      {quoteText}
    </div>
  );
}

function getVideoCaptionPositionClass(style: CaptionStyle) {
  if (style === "bold-center" || style === "testimony-quote") {
    return "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center";
  }

  if (
    style === "scripture-card" ||
    style === "minimal-white" ||
    style === "black-outline"
  ) {
    return "left-1/2 top-[calc(5rem+env(safe-area-inset-top))] -translate-x-1/2 text-center";
  }

  return "bottom-[calc(9.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-center md:bottom-28";
}

function getVideoCaptionStyleClass(style: CaptionStyle) {
  if (style === "bold-center") {
    return "rounded-[1.5rem] bg-black/45 font-black text-white backdrop-blur";
  }
  if (style === "bottom-banner") {
    return "rounded-2xl bg-black/75 font-bold text-white backdrop-blur";
  }
  if (style === "highlight-box") {
    return "rounded-[1.5rem] bg-yellow-300/95 font-black text-yellow-950 ring-1 ring-white/70";
  }
  if (style === "scripture-card") {
    return "rounded-[1.5rem] bg-blue-50/90 font-serif italic text-[#082f63] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "praise-glow") {
    return "rounded-[1.5rem] bg-amber-300/90 font-black text-amber-950 ring-1 ring-white/70 shadow-amber-300/30";
  }
  if (style === "testimony-quote") {
    return "rounded-[1.5rem] bg-white/90 font-black text-[#062a57] ring-1 ring-white/70 backdrop-blur";
  }
  if (style === "minimal-white") {
    return "font-black text-white shadow-none [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]";
  }
  if (style === "black-outline") {
    return "font-black text-white shadow-none [text-shadow:2px_2px_0_#000,-2px_2px_0_#000,2px_-2px_0_#000,-2px_-2px_0_#000]";
  }
  if (style === "soft-gradient") {
    return "rounded-[1.5rem] bg-gradient-to-r from-black/70 via-[#0b63ce]/60 to-black/50 font-bold text-white backdrop-blur";
  }
  return "rounded-2xl bg-white/90 font-semibold text-slate-900 ring-1 ring-white/70";
}

function getVideoCaptionFontClass(font: CaptionFont) {
  if (font === "bold-testimony") return "font-sans font-black tracking-tight";
  if (font === "soft-scripture") return "font-serif font-semibold italic";
  if (font === "praise-handwritten") {
    return "font-serif font-black italic tracking-wide";
  }
  if (font === "modern-serif") return "font-serif font-bold";
  return "font-sans font-semibold";
}

function getVideoCaptionColorClass(color: CaptionColor) {
  if (color === "deep-navy") return "!text-[#062a57]";
  if (color === "soft-gold") return "!text-amber-200";
  if (color === "prayer-blue") return "!text-blue-200";
  if (color === "warm-cream") return "!text-[#fff4d6]";
  if (color === "praise-green") return "!text-emerald-200";
  return "!text-white";
}

function getVideoCaptionSizeClass(size?: CaptionSize) {
  if (size === "small") return "text-xs sm:text-sm";
  if (size === "large") return "text-base sm:text-xl";
  if (size === "extra-large") return "text-xl sm:text-3xl";
  return "text-sm sm:text-base";
}

function getVideoCaptionTextShadow(color: CaptionColor) {
  if (color === "deep-navy") {
    return "0 1px 10px rgba(255,255,255,0.72)";
  }

  return "0 2px 12px rgba(0,0,0,0.62)";
}

function VideoActionButton({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="group flex flex-col items-center gap-1 text-white"
      aria-label={label}
      title={label}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 backdrop-blur-md transition ${
          active
            ? "bg-white text-[#0b63ce] ring-white"
            : "bg-white/15 text-white/85 ring-white/20 group-hover:bg-white/25"
        }`}
      >
        {icon}
      </span>

      {count !== null && (
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black leading-none text-white/90 backdrop-blur">
          {count}
        </span>
      )}

      <span className="text-[10px] font-black leading-none text-white/80 drop-shadow">
        {label}
      </span>
    </button>
  );
}

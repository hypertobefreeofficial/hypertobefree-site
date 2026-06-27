"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bookmark,
  Bug,
  Captions,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  Globe2,
  HandHeart,
  HeartHandshake,
  Home,
  MessageCircleHeart,
  MoreVertical,
  Pause,
  Play,
  Search,
  Send,
  Share2,
  Sparkles,
  Trash2,
  UserX,
  UserRound,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import StoryMediaStamp from "../../components/StoryMediaStamp";
import StoryOverlayText from "../../components/StoryOverlayText";
import { supabase } from "../../lib/supabaseClient";

type ReactionType = "amen" | "praise_god" | "encouraged" | "praying";
type VideoLanguage = "spanish" | "english";
type VideoViewingMode =
  | "standard"
  | "audio_testimony"
  | "scripture_companion"
  | "prayer_focus"
  | "god_is_moving";

type VideoSourceContext = "search" | "freedom-feed";

type VideoFeedExperienceProps = {
  sourceContext?: VideoSourceContext;
  returnPath?: string;
  returnLabel?: string;
  videosPath?: string;
};
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
  | "soft-gradient"
  | "elegant-script";
type CaptionFont =
  | "classic"
  | "bold"
  | "scripture"
  | "praise"
  | "testimony"
  | "minimal"
  | "grace-script";
type CaptionColor =
  | "white"
  | "black"
  | "deep-navy"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green"
  | `#${string}`;
type CaptionSize = "small" | "medium" | "large" | "extra-large";
type CaptionAlign = "left" | "center" | "right";
type CaptionBackground =
  | "none"
  | "soft-pill"
  | "glass-blur"
  | "dark-banner"
  | "glow-box"
  | "scripture-card";
type CaptionTemplate =
  | "testimony-light"
  | "prayer-calm"
  | "scripture-focus"
  | "freedom-glow"
  | "quiet-strength"
  | "celebration-praise";
type VideoTemplate =
  | "none"
  | "htbf-logo"
  | "freedom-silhouette"
  | "shared-through-htbf"
  | "freedom-story"
  | "prayer-moment"
  | "praise-report"
  | "god-did-it";

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
  overlay_text: string | null;
  overlay_x: number | null;
  overlay_y: number | null;
  caption_style: CaptionStyle | null;
  caption_font: CaptionFont;
  caption_background: CaptionBackground;
  caption_template: CaptionTemplate | null;
  caption_color: CaptionColor;
  caption_size: CaptionSize;
  caption_align: CaptionAlign;
  video_template: VideoTemplate;
  htbf_watermark_enabled: boolean;
  silhouette_watermark_enabled: boolean;
  shared_htbf_intro_enabled: boolean;
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
  signInToSave: string;
  saveVideo: string;
  unsaveVideo: string;
  saveVideoError: string;
  videoSaved: string;
  videoUnsaved: string;
  blockUser: string;
  blockUserError: string;
  userBlocked: string;
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
  audioTestimonyMode: string;
  audioTestimonyModeDescription: string;
  audioModeOn: string;
  audioModeOff: string;
  audioModeEnabled: string;
  audioModeDisabled: string;
  audioModePaused: string;
  haptics: string;
  hapticsDescription: string;
  hapticsOn: string;
  hapticsOff: string;
  playbackSpeed: string;
  language: string;
  captionsComingSoon: string;
  share: string;
  copyLink: string;
  reportBug: string;
  bugReportEyebrow: string;
  bugReportTitle: string;
  bugReportBody: string;
  bugReportPlaceholder: string;
  bugReportEmpty: string;
  bugReportSubmitted: string;
  closeMenu: string;
  report: string;
  removeVideo: string;
  loadingVideo: string;
  playVideo: string;
  pauseVideo: string;
  turnSoundOff: string;
  turnSoundOn: string;
  zoom: string;
  showCaption: string;
  hideCaption: string;
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

const videoFeedBottomNavItems = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/video-feed", label: "Videos", icon: Video },
  { href: "/prayer", label: "Prayer", icon: HandHeart },
  { href: "/journey", label: "Journey", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

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
    signInToSave: "Please sign in to save videos.",
    saveVideo: "Save Video",
    unsaveVideo: "Remove from Saved",
    saveVideoError: "Could not update saved content",
    videoSaved: "Video saved.",
    videoUnsaved: "Video removed from saved content.",
    blockUser: "Block User",
    blockUserError: "Could not block user",
    userBlocked: "User blocked. Their videos are now hidden.",
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
    audioTestimonyMode: "Audio Testimony Mode",
    audioTestimonyModeDescription:
      "Listen continuously. HTBF will advance to the next testimony when this one ends.",
    audioModeOn: "On",
    audioModeOff: "Off",
    audioModeEnabled:
      "Audio Testimony Mode on. HTBF will keep the testimonies moving.",
    audioModeDisabled: "Audio Testimony Mode off.",
    audioModePaused: "Audio Testimony Mode paused.",
    haptics: "Haptics",
    hapticsDescription: "Light taps when you use controls or land on a new video.",
    hapticsOn: "On",
    hapticsOff: "Off",
    playbackSpeed: "Playback Speed",
    language: "Language",
    captionsComingSoon: "Captions coming soon",
    share: "Share",
    copyLink: "Copy link",
    reportBug: "Report a bug / technical issue",
    bugReportEyebrow: "Technical Issue",
    bugReportTitle: "What technical issue did you notice?",
    bugReportBody:
      "Tell us about playback errors, bad sizing, broken buttons, caption glitches, or anything that did not work.",
    bugReportPlaceholder: "Describe the technical issue...",
    bugReportEmpty: "Please describe the technical issue first.",
    bugReportSubmitted: "Bug report sent to HTBF admin.",
    closeMenu: "Close",
    report: "Report",
    removeVideo: "Remove Video",
    loadingVideo: "Loading video",
    playVideo: "Play video",
    pauseVideo: "Pause video",
    turnSoundOff: "Turn sound off",
    turnSoundOn: "Turn sound on",
    zoom: "Zoom",
    showCaption: "Show caption",
    hideCaption: "Hide caption",
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
    signInToSave: "Inicia sesión para guardar videos.",
    saveVideo: "Guardar video",
    unsaveVideo: "Quitar de guardados",
    saveVideoError: "No se pudo actualizar el contenido guardado",
    videoSaved: "Video guardado.",
    videoUnsaved: "Video eliminado de guardados.",
    blockUser: "Bloquear usuario",
    blockUserError: "No se pudo bloquear al usuario",
    userBlocked: "Usuario bloqueado. Sus videos ahora están ocultos.",
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
    audioTestimonyMode: "Modo testimonio en audio",
    audioTestimonyModeDescription:
      "Escucha continuamente. HTBF avanzará al siguiente testimonio cuando termine este.",
    audioModeOn: "Activado",
    audioModeOff: "Desactivado",
    audioModeEnabled:
      "Modo testimonio en audio activado. HTBF seguirá avanzando los testimonios.",
    audioModeDisabled: "Modo testimonio en audio desactivado.",
    audioModePaused: "Modo testimonio en audio pausado.",
    haptics: "Hápticos",
    hapticsDescription:
      "Toques suaves al usar controles o llegar a un video nuevo.",
    hapticsOn: "Activado",
    hapticsOff: "Desactivado",
    playbackSpeed: "Velocidad",
    language: "Idioma",
    captionsComingSoon: "Subtítulos próximamente",
    share: "Compartir",
    copyLink: "Copiar enlace",
    reportBug: "Reportar un error / problema técnico",
    bugReportEyebrow: "Problema técnico",
    bugReportTitle: "¿Qué problema técnico notaste?",
    bugReportBody:
      "Cuéntanos sobre errores de reproducción, tamaño incorrecto, botones rotos, subtítulos con fallas o algo que no funcionó.",
    bugReportPlaceholder: "Describe el problema técnico...",
    bugReportEmpty: "Describe primero el problema técnico.",
    bugReportSubmitted: "Reporte técnico enviado al administrador de HTBF.",
    closeMenu: "Cerrar",
    report: "Reportar",
    removeVideo: "Quitar video",
    loadingVideo: "Cargando video",
    playVideo: "Reproducir video",
    pauseVideo: "Pausar video",
    turnSoundOff: "Apagar sonido",
    turnSoundOn: "Activar sonido",
    zoom: "Zoom",
    showCaption: "Mostrar subtítulo",
    hideCaption: "Ocultar subtítulo",
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
const videoViewingModeStorageKey = "htbf-video-viewing-mode";
const videoHapticsStorageKey = "htbf_video_haptics_enabled";

const languageOptions: { label: string; value: VideoLanguage }[] = [
  { label: "Español", value: "spanish" },
  { label: "English", value: "english" },
];

const videoViewingModes: VideoViewingMode[] = [
  "standard",
  "audio_testimony",
  "scripture_companion",
  "prayer_focus",
  "god_is_moving",
];

function isVideoViewingMode(value: string | null): value is VideoViewingMode {
  return videoViewingModes.includes(value as VideoViewingMode);
}

function triggerHaptic(enabled: boolean) {
  if (!enabled) return;
  if (typeof navigator === "undefined") return;

  const maybeNavigator = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };

  if (typeof maybeNavigator.vibrate === "function") {
    maybeNavigator.vibrate(10);
  }
}

export function VideoFeedExperience({
  sourceContext = "search",
  returnPath = "/search",
  returnLabel,
  videosPath = "/video-feed",
}: VideoFeedExperienceProps = {}) {
  const videoFeedScrollerRef = useRef<HTMLElement | null>(null);
  const activeStoryHapticRef = useRef<string | null>(null);
  const exitGuardInstalledRef = useRef(false);
  const exitingVideoRef = useRef(false);

  const [checkingUser, setCheckingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<VideoStory[]>([]);
  const [message, setMessage] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [entrySource, setEntrySource] =
    useState<VideoSourceContext>(sourceContext);

  const [replyStory, setReplyStory] = useState<VideoStory | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [reportStory, setReportStory] = useState<VideoStory | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [bugReportStory, setBugReportStory] = useState<VideoStory | null>(null);
  const [bugReportDetails, setBugReportDetails] = useState("");
  const [sendingBugReport, setSendingBugReport] = useState(false);

  const [soundOn, setSoundOn] = useState(false);
  const [beStillMode, setBeStillMode] = useState(false);
  const [viewingMode, setViewingMode] =
    useState<VideoViewingMode>("standard");
  const [hapticsEnabled, setHapticsEnabled] = useState(false);
  const [optionsStoryId, setOptionsStoryId] = useState<string | null>(null);
  const [savedStoryIds, setSavedStoryIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [hiddenCaptionStoryIds, setHiddenCaptionStoryIds] = useState<string[]>(
    []
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedLanguage, setSelectedLanguage] =
    useState<VideoLanguage>("english");
  const copy = videoFeedCopy[selectedLanguage];
  const audioTestimonyMode = viewingMode === "audio_testimony";
  const resolvedReturnPath =
    returnPath || (sourceContext === "freedom-feed" ? "/feed" : "/search");

  useEffect(() => {
    if (!message) return;

    const timeout = message === prayerCircleJoinedMessage ? 2000 : 2500;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, timeout);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(videoViewingModeStorageKey);

    if (isVideoViewingMode(savedMode)) {
      setViewingMode(savedMode);

      if (savedMode === "audio_testimony") {
        setSoundOn(true);
      }
    }
  }, []);

  useEffect(() => {
    const savedHaptics = window.localStorage.getItem(videoHapticsStorageKey);
    setHapticsEnabled(savedHaptics === "true");
  }, []);

  useEffect(() => {
    if (exitGuardInstalledRef.current) return;

    exitGuardInstalledRef.current = true;

    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const currentState =
      typeof window.history.state === "object" && window.history.state !== null
        ? window.history.state
        : {};

    window.history.replaceState(
      {
        ...currentState,
        htbfVideoExperience: true,
        sourceContext,
      },
      "",
      currentUrl
    );
    window.history.pushState(
      {
        htbfVideoExitGuard: true,
        sourceContext,
      },
      "",
      currentUrl
    );

    function handleVideoPopState() {
      if (exitingVideoRef.current) return;

      exitingVideoRef.current = true;
      window.location.assign(resolvedReturnPath);
    }

    window.addEventListener("popstate", handleVideoPopState);

    return () => {
      window.removeEventListener("popstate", handleVideoPopState);
    };
  }, [resolvedReturnPath, sourceContext]);

  useEffect(() => {
    window.localStorage.setItem(videoViewingModeStorageKey, viewingMode);
  }, [viewingMode]);

  useEffect(() => {
    let currentUserId: string | null = null;

    async function loadPage() {
      setCheckingUser(true);
      setMessage("");

      const params = new URLSearchParams(window.location.search);
      setSelectedStoryId(params.get("story"));
      setEntrySource(sourceContext);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      currentUserId = user.id;
      setUserId(user.id);

      await Promise.all([loadVideoStories(user.id), loadAccountSafety(user.id)]);
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
      value === "soft-gradient" ||
      value === "elegant-script"
    ) {
      return value;
    }

    return "classic-caption";
  }

  function getCaptionColor(value: string | null | undefined): CaptionColor {
    if (
      value === "white" ||
      value === "black" ||
      value === "deep-navy" ||
      value === "soft-gold" ||
      value === "prayer-blue" ||
      value === "warm-cream" ||
      value === "praise-green"
    ) {
      return value;
    }

    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
      return value as `#${string}`;
    }

    return "white";
  }

  function getCaptionSize(value: string | null | undefined): CaptionSize {
    if (
      value === "small" ||
      value === "medium" ||
      value === "large" ||
      value === "extra-large"
    ) {
      return value;
    }

    return "medium";
  }

  function getCaptionAlign(value: string | null | undefined): CaptionAlign {
    if (value === "left" || value === "center" || value === "right") {
      return value;
    }

    return "center";
  }

  function getCaptionFont(
    value: string | null | undefined,
    legacyStyle?: CaptionStyle | null
  ): CaptionFont {
    if (
      value === "classic" ||
      value === "bold" ||
      value === "scripture" ||
      value === "praise" ||
      value === "testimony" ||
      value === "minimal" ||
      value === "grace-script"
    ) {
      return value;
    }

    if (legacyStyle === "bold-center") return "bold";
    if (legacyStyle === "scripture-card") return "scripture";
    if (legacyStyle === "praise-glow") return "praise";
    if (legacyStyle === "testimony-quote") return "testimony";
    if (legacyStyle === "minimal-white" || legacyStyle === "black-outline") {
      return "minimal";
    }
    if (legacyStyle === "elegant-script") return "grace-script";

    return "classic";
  }

  function getCaptionBackground(
    value: string | null | undefined,
    legacyStyle?: CaptionStyle | null
  ): CaptionBackground {
    if (
      value === "none" ||
      value === "soft-pill" ||
      value === "glass-blur" ||
      value === "dark-banner" ||
      value === "glow-box" ||
      value === "scripture-card"
    ) {
      return value;
    }

    if (legacyStyle === "bottom-banner") return "dark-banner";
    if (legacyStyle === "scripture-card") return "scripture-card";
    if (legacyStyle === "soft-gradient" || legacyStyle === "praise-glow") {
      return "glow-box";
    }
    if (legacyStyle === "minimal-white" || legacyStyle === "black-outline") {
      return "none";
    }

    return "soft-pill";
  }

  function getCaptionTemplate(
    value: string | null | undefined
  ): CaptionTemplate | null {
    if (
      value === "testimony-light" ||
      value === "prayer-calm" ||
      value === "scripture-focus" ||
      value === "freedom-glow" ||
      value === "quiet-strength" ||
      value === "celebration-praise"
    ) {
      return value;
    }

    return null;
  }

  function getVideoTemplate(value: string | null | undefined): VideoTemplate {
    if (
      value === "none" ||
      value === "htbf-logo" ||
      value === "freedom-silhouette" ||
      value === "shared-through-htbf" ||
      value === "freedom-story" ||
      value === "prayer-moment" ||
      value === "praise-report" ||
      value === "god-did-it"
    ) {
      return value;
    }

    if (value === "freedom") return "freedom-story";
    if (value === "testimony") return "shared-through-htbf";
    if (value === "prayer_circle") return "prayer-moment";
    if (value === "revival") return "praise-report";
    if (value === "kingdom") return "htbf-logo";

    return "none";
  }

  function readNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  async function loadAccountSafety(currentUserId: string) {
    const [savedResult, blockedResult] = await Promise.all([
      supabase
        .from("saved_content")
        .select("story_id")
        .eq("user_id", currentUserId),
      supabase
        .from("blocked_users")
        .select("blocked_user_id")
        .eq("blocker_user_id", currentUserId),
    ]);

    if (!savedResult.error) {
      const savedRows: unknown[] = Array.isArray(savedResult.data)
        ? savedResult.data
        : [];
      setSavedStoryIds(
        savedRows.flatMap((row) =>
          typeof row === "object" &&
          row !== null &&
          "story_id" in row &&
          typeof row.story_id === "string"
            ? [row.story_id]
            : []
        )
      );
    }

    if (!blockedResult.error) {
      const blockedRows: unknown[] = Array.isArray(blockedResult.data)
        ? blockedResult.data
        : [];
      setBlockedUserIds(
        blockedRows.flatMap((row) =>
          typeof row === "object" &&
          row !== null &&
          "blocked_user_id" in row &&
          typeof row.blocked_user_id === "string"
            ? [row.blocked_user_id]
            : []
        )
      );
    }
  }

  async function loadVideoStories(currentUserId: string | null) {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, location, story_type, story_text, overlay_text, overlay_x, overlay_y, caption_style, caption_font, caption_background, caption_template, caption_color, caption_size, caption_align, video_template, htbf_watermark_enabled, silhouette_watermark_enabled, shared_htbf_intro_enabled, video_url, status, created_at, prayer_status, answered_at, answered_text"
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

        const captionStyle = getCaptionStyle(story.caption_style);

        return {
          ...story,
          caption_style: captionStyle,
          caption_font: getCaptionFont(story.caption_font, captionStyle),
          caption_background: getCaptionBackground(
            story.caption_background,
            captionStyle
          ),
          caption_template: getCaptionTemplate(story.caption_template),
          caption_color: getCaptionColor(story.caption_color),
          caption_size: getCaptionSize(story.caption_size),
          caption_align: getCaptionAlign(story.caption_align),
          video_template: getVideoTemplate(story.video_template),
          htbf_watermark_enabled: story.htbf_watermark_enabled !== false,
          silhouette_watermark_enabled:
            story.silhouette_watermark_enabled === true,
          shared_htbf_intro_enabled:
            story.shared_htbf_intro_enabled === true,
          overlay_text: story.overlay_text ?? null,
          overlay_x: readNumber(story.overlay_x),
          overlay_y: readNumber(story.overlay_y),
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
    const visibleStories = stories.filter(
      (story) =>
        !story.user_id || !blockedUserIds.includes(story.user_id)
    );

    if (!selectedStoryId) return visibleStories;

    const selected = visibleStories.find(
      (story) => story.id === selectedStoryId
    );
    const rest = visibleStories.filter(
      (story) => story.id !== selectedStoryId
    );

    return selected ? [selected, ...rest] : visibleStories;
  }, [blockedUserIds, stories, selectedStoryId]);

  useEffect(() => {
    const scroller = videoFeedScrollerRef.current;

    if (!scroller || orderedStories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.65
          )
          .sort((firstEntry, secondEntry) => {
            return secondEntry.intersectionRatio - firstEntry.intersectionRatio;
          })[0];

        if (!visibleEntry) return;

        const nextStoryId = (visibleEntry.target as HTMLElement).dataset
          .storyId;

        if (!nextStoryId || activeStoryHapticRef.current === nextStoryId) {
          return;
        }

        if (activeStoryHapticRef.current) {
          triggerHaptic(hapticsEnabled);
        }

        activeStoryHapticRef.current = nextStoryId;
      },
      {
        root: scroller,
        threshold: [0.65],
      }
    );

    orderedStories.forEach((story) => {
      const storyElement = document.getElementById(`video-story-${story.id}`);

      if (storyElement) {
        observer.observe(storyElement);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [hapticsEnabled, orderedStories]);

  function scrollToVideoStory(nextIndex: number) {
    if (orderedStories.length === 0) return;

    const normalizedIndex =
      nextIndex >= orderedStories.length ? 0 : Math.max(nextIndex, 0);
    const nextStory = orderedStories[normalizedIndex];
    const nextStoryElement = document.getElementById(
      `video-story-${nextStory.id}`
    );

    nextStoryElement?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function toggleAudioTestimonyMode() {
    setViewingMode((currentMode) => {
      const nextMode =
        currentMode === "audio_testimony" ? "standard" : "audio_testimony";

      if (nextMode === "audio_testimony") {
        setSoundOn(true);
        setBeStillMode(false);
        setMessage(copy.audioModeEnabled);
      } else {
        setMessage(copy.audioModeDisabled);
      }

      return nextMode;
    });
  }

  function toggleHaptics() {
    setHapticsEnabled((currentValue) => {
      const nextValue = !currentValue;

      window.localStorage.setItem(videoHapticsStorageKey, String(nextValue));
      triggerHaptic(nextValue);

      return nextValue;
    });
  }

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

  async function toggleSavedVideo(story: VideoStory) {
    if (!userId) {
      setMessage(copy.signInToSave);
      return;
    }

    const isSaved = savedStoryIds.includes(story.id);
    const { error } = isSaved
      ? await supabase
          .from("saved_content")
          .delete()
          .eq("user_id", userId)
          .eq("story_id", story.id)
      : await supabase.from("saved_content").insert({
          user_id: userId,
          story_id: story.id,
        });

    if (error) {
      setMessage(`${copy.saveVideoError}: ${error.message}`);
      return;
    }

    setSavedStoryIds((current) =>
      isSaved
        ? current.filter((storyId) => storyId !== story.id)
        : [...current, story.id]
    );
    setMessage(isSaved ? copy.videoUnsaved : copy.videoSaved);
  }

  async function blockVideoUser(story: VideoStory) {
    if (!userId || !story.user_id || story.user_id === userId) return;

    const blockedUserId = story.user_id;
    const { error } = await supabase.from("blocked_users").upsert(
      {
        blocker_user_id: userId,
        blocked_user_id: blockedUserId,
      },
      { onConflict: "blocker_user_id,blocked_user_id" }
    );

    if (error) {
      setMessage(`${copy.blockUserError}: ${error.message}`);
      return;
    }

    setOptionsStoryId(null);
    setBlockedUserIds((current) =>
      current.includes(blockedUserId) ? current : [...current, blockedUserId]
    );
    setMessage(copy.userBlocked);
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

  function openBugReportModal(story: VideoStory) {
    setBugReportStory(story);
    setBugReportDetails("");
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

  async function submitBugReport() {
    if (!bugReportStory) {
      return;
    }

    const cleanDetails = bugReportDetails.trim();

    if (!cleanDetails) {
      setMessage(copy.bugReportEmpty);
      return;
    }

    setSendingBugReport(true);
    setMessage("");

    const { error } = await supabase.from("content_reports").insert({
      story_id: bugReportStory.id,
      reporter_user_id: userId ?? null,
      reported_user_id: bugReportStory.user_id,
      reason: "bug",
      details: cleanDetails,
      status: "open",
    });

    setSendingBugReport(false);

    if (error) {
      setMessage(`${copy.reportSubmitError}: ${error.message}`);
      return;
    }

    setBugReportStory(null);
    setBugReportDetails("");
    setMessage(copy.bugReportSubmitted);
  }

  async function copyStoryLink(story: VideoStory) {
    const shareUrl = `${window.location.origin}${videosPath}?story=${
      story.id
    }&source=${entrySource === "freedom-feed" ? "freedom-feed" : "search"}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage(copy.shareLinkCopied);
    } catch (error) {
      console.error("Copy link failed:", error);
    }
  }

  function toggleCaptionVisibility(storyId: string) {
    setHiddenCaptionStoryIds((current) =>
      current.includes(storyId)
        ? current.filter((id) => id !== storyId)
        : [...current, storyId]
    );
  }

  async function shareStory(story: VideoStory) {
    setMessage("");

    const shareText = story.story_text
      ? `${copy.shareWithTextPrefix}: ${story.story_text.slice(0, 140)}`
      : copy.shareFallback;

    const shareUrl = `${window.location.origin}${videosPath}?story=${
      story.id
    }&source=${entrySource === "freedom-feed" ? "freedom-feed" : "search"}`;

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

  const resolvedReturnLabel =
    returnLabel ??
    (entrySource === "freedom-feed"
      ? "Back to Freedom Feed"
      : copy.backToSearch);

  function exitVideoExperience() {
    if (exitingVideoRef.current) return;

    exitingVideoRef.current = true;
    window.location.assign(resolvedReturnPath);
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      {!beStillMode && (
        <div className="fixed left-4 top-4 z-50">
          <button
            type="button"
            onClick={exitVideoExperience}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            aria-label={resolvedReturnLabel}
          >
            {entrySource === "freedom-feed" ? (
              <X className="h-5 w-5" />
            ) : (
              <ArrowLeft className="h-5 w-5" />
            )}
          </button>
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
        <section
          ref={videoFeedScrollerRef}
          className="h-full snap-y snap-mandatory overflow-y-scroll bg-black"
        >
          {orderedStories.map((story, index) => {
            if (!story.signed_video_url) return null;

            const isOwner = Boolean(userId && story.user_id === userId);
            const isSaved = savedStoryIds.includes(story.id);
            const captionHidden = hiddenCaptionStoryIds.includes(story.id);

            return (
              <article
                id={`video-story-${story.id}`}
                key={story.id}
                data-story-id={story.id}
                className="relative flex h-[100dvh] snap-start items-center justify-center overflow-hidden bg-black"
              >
                <AutoPlayReelVideo
                  videoUrl={story.signed_video_url}
                  template={story.video_template}
                  overlayText={story.overlay_text}
                  overlayX={story.overlay_x}
                  overlayY={story.overlay_y}
                  captionStyle={story.caption_style ?? "classic-caption"}
                  captionFont={story.caption_font}
                  captionBackground={story.caption_background}
                  captionColor={story.caption_color}
                  captionSize={story.caption_size}
                  captionAlign={story.caption_align}
                  soundOn={soundOn}
                  onSoundChange={setSoundOn}
                  eagerLoad={index === 0}
                  beStillMode={beStillMode}
                  audioTestimonyMode={audioTestimonyMode}
                  onAudioModeAdvance={() => scrollToVideoStory(index + 1)}
                  onAudioModeManualPause={() =>
                    setMessage(copy.audioModePaused)
                  }
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
                    className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/80 focus:outline-none focus:ring-4 focus:ring-white/25"
                    aria-label={copy.moreOptions}
                    aria-expanded={optionsStoryId === story.id}
                    title={copy.moreOptions}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                )}

                {optionsStoryId === story.id && !beStillMode && (
                  <VideoOptionsMenu
                    isOwner={isOwner}
                    isSaved={isSaved}
                    playbackRate={playbackRate}
                    setPlaybackRate={setPlaybackRate}
                    selectedLanguage={selectedLanguage}
                    audioTestimonyMode={audioTestimonyMode}
                    hapticsEnabled={hapticsEnabled}
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
                    onToggleAudioTestimonyMode={() => {
                      setOptionsStoryId(null);
                      toggleAudioTestimonyMode();
                    }}
                    onToggleHaptics={toggleHaptics}
                    onShare={() => {
                      setOptionsStoryId(null);
                      shareStory(story);
                    }}
                    onCopyLink={() => {
                      setOptionsStoryId(null);
                      copyStoryLink(story);
                    }}
                    onToggleSaved={() => {
                      setOptionsStoryId(null);
                      void toggleSavedVideo(story);
                    }}
                    onBlockUser={() => {
                      void blockVideoUser(story);
                    }}
                    onReport={() => {
                      setOptionsStoryId(null);
                      openReportModal(story);
                    }}
                    onBugReport={() => {
                      setOptionsStoryId(null);
                      openBugReportModal(story);
                    }}
                    captionHidden={captionHidden}
                    onToggleCaption={() => {
                      setOptionsStoryId(null);
                      toggleCaptionVisibility(story.id);
                    }}
                    onRemove={() => {
                      setOptionsStoryId(null);
                      removeMyVideo(story);
                    }}
                    onClose={() => {
                      setOptionsStoryId(null);
                    }}
                  />
                )}

                {!beStillMode && !audioTestimonyMode && (
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

                {!beStillMode && (
                  <VideoInfoOverlay
                    captionHidden={captionHidden}
                    copy={copy}
                    onToggleCaption={() => {
                      toggleCaptionVisibility(story.id);
                    }}
                    story={story}
                  />
                )}

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

      {!beStillMode && (
        <VideoFeedBottomNav
          onNavTap={() => triggerHaptic(hapticsEnabled)}
          videosHref={videosPath}
        />
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

      {bugReportStory && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
                  {copy.bugReportEyebrow}
                </div>

                <h2 className="mt-1 text-xl font-black text-[#062a57]">
                  {copy.bugReportTitle}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {copy.bugReportBody}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setBugReportStory(null);
                  setBugReportDetails("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label={copy.closeReportBox}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={bugReportDetails}
              onChange={(event) => setBugReportDetails(event.target.value)}
              rows={5}
              placeholder={copy.bugReportPlaceholder}
              className="w-full resize-none rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />

            <button
              type="button"
              disabled={sendingBugReport}
              onClick={submitBugReport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-base font-black text-slate-950 shadow-sm hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingBugReport ? copy.submitting : copy.reportBug}
              <Bug className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function VideoFeedPage() {
  return (
    <VideoFeedExperience
      returnPath="/search"
      sourceContext="search"
      videosPath="/video-feed"
    />
  );
}

function VideoOptionsMenu({
  captionHidden,
  isOwner,
  isSaved,
  playbackRate,
  setPlaybackRate,
  selectedLanguage,
  audioTestimonyMode,
  hapticsEnabled,
  onLanguageSelect,
  copy,
  onBeStill,
  onToggleAudioTestimonyMode,
  onToggleHaptics,
  onBugReport,
  onCopyLink,
  onToggleSaved,
  onBlockUser,
  onShare,
  onReport,
  onToggleCaption,
  onRemove,
  onClose,
}: {
  captionHidden: boolean;
  isOwner: boolean;
  isSaved: boolean;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  selectedLanguage: VideoLanguage;
  audioTestimonyMode: boolean;
  hapticsEnabled: boolean;
  onLanguageSelect: (language: VideoLanguage) => void;
  copy: VideoFeedCopy;
  onBeStill: () => void;
  onToggleAudioTestimonyMode: () => void;
  onToggleHaptics: () => void;
  onBugReport: () => void;
  onCopyLink: () => void;
  onToggleSaved: () => void;
  onBlockUser: () => void;
  onShare: () => void;
  onReport: () => void;
  onToggleCaption: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-[100] max-h-[calc(100dvh-6rem)] w-72 overflow-y-auto rounded-[2rem] bg-white/95 p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 backdrop-blur"
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

      <button
        type="button"
        onClick={onToggleAudioTestimonyMode}
        aria-pressed={audioTestimonyMode}
        className={`mb-3 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
          audioTestimonyMode
            ? "bg-[#0b63ce] text-white shadow-md shadow-blue-900/20"
            : "bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
        }`}
      >
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          🎧
        </span>
        <span className="min-w-0">
          <span className="block">{copy.audioTestimonyMode}</span>
          <span
            className={`mt-1 block text-xs font-bold leading-5 ${
              audioTestimonyMode ? "text-blue-50" : "text-slate-500"
            }`}
          >
            {audioTestimonyMode ? copy.audioModeOn : copy.audioModeOff} ·{" "}
            {copy.audioTestimonyModeDescription}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleHaptics}
        aria-pressed={hapticsEnabled}
        className={`mb-3 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
          hapticsEnabled
            ? "bg-[#0b63ce] text-white shadow-md shadow-blue-900/20"
            : "bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
        }`}
      >
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          ✨
        </span>
        <span className="min-w-0">
          <span className="block">
            {copy.haptics}: {hapticsEnabled ? copy.hapticsOn : copy.hapticsOff}
          </span>
          <span
            className={`mt-1 block text-xs font-bold leading-5 ${
              hapticsEnabled ? "text-blue-50" : "text-slate-500"
            }`}
          >
            {copy.hapticsDescription}
          </span>
        </span>
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
        onClick={onCopyLink}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        <Copy className="h-4 w-4" />
        {copy.copyLink}
      </button>

      <button
        type="button"
        onClick={onToggleSaved}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
        {isSaved ? copy.unsaveVideo : copy.saveVideo}
      </button>

      {!isOwner && (
        <button
          type="button"
          onClick={onBlockUser}
          className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-red-50 px-3 py-3 text-sm font-black text-red-700 hover:bg-red-100"
        >
          <UserX className="h-4 w-4" />
          {copy.blockUser}
        </button>
      )}

      <button
        type="button"
        onClick={onToggleCaption}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#0b63ce]"
      >
        {captionHidden ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
        {captionHidden ? copy.showCaption : copy.hideCaption}
      </button>

      <button
        type="button"
        onClick={onReport}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-red-50 px-3 py-3 text-sm font-black text-red-700 hover:bg-red-100"
      >
        <Flag className="h-4 w-4" />
        {copy.report}
      </button>

      <button
        type="button"
        onClick={onBugReport}
        className="mb-2 flex w-full items-center gap-2 rounded-2xl bg-amber-50 px-3 py-3 text-sm font-black text-amber-800 hover:bg-amber-100"
      >
        <Bug className="h-4 w-4" />
        {copy.reportBug}
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

      <button
        type="button"
        onClick={onClose}
        className="mt-2 flex w-full items-center justify-center rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 hover:bg-slate-200"
      >
        {copy.closeMenu}
      </button>
    </div>
  );
}

function AutoPlayReelVideo({
  videoUrl,
  template,
  overlayText,
  overlayX,
  overlayY,
  captionStyle,
  captionFont,
  captionBackground,
  captionColor,
  captionSize,
  captionAlign,
  soundOn,
  onSoundChange,
  eagerLoad,
  beStillMode,
  audioTestimonyMode,
  onAudioModeAdvance,
  onAudioModeManualPause,
  playbackRate,
  copy,
}: {
  videoUrl: string;
  template: VideoTemplate;
  overlayText: string | null;
  overlayX: number | null;
  overlayY: number | null;
  captionStyle: CaptionStyle;
  captionFont: CaptionFont;
  captionBackground: CaptionBackground;
  captionColor: CaptionColor;
  captionSize: CaptionSize;
  captionAlign: CaptionAlign;
  soundOn: boolean;
  onSoundChange: (nextValue: boolean) => void;
  eagerLoad: boolean;
  beStillMode: boolean;
  audioTestimonyMode: boolean;
  onAudioModeAdvance: () => void;
  onAudioModeManualPause: () => void;
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
  const noAudioAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const holdPausedRef = useRef(false);
  const pointerInsideRef = useRef(false);

  const syncVideoMutedState = useCallback(
    (video: HTMLVideoElement) => {
      const shouldMute = !soundOn;

      video.muted = shouldMute;

      if (!shouldMute) {
        video.volume = 1;
      }
    },
    [soundOn]
  );

  useEffect(() => {
    return () => {
      if (noAudioAdvanceTimeoutRef.current) {
        clearTimeout(noAudioAdvanceTimeoutRef.current);
      }
    };
  }, []);

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

    syncVideoMutedState(video);
    video.playsInline = true;
    video.loop = !audioTestimonyMode;
    video.playbackRate = playbackRate;

    const playObserver = new IntersectionObserver(
      ([entry]) => {
        if (!video) return;

        const isMostlyVisible =
          entry.isIntersecting && entry.intersectionRatio >= 0.65;

        if (isMostlyVisible) {
          if (!userPaused) {
            syncVideoMutedState(video);
            video.loop = !audioTestimonyMode;
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
    audioTestimonyMode,
    syncVideoMutedState,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    syncVideoMutedState(video);
    video.loop = !audioTestimonyMode;
  }, [audioTestimonyMode, syncVideoMutedState]);

  useEffect(() => {
    if (!audioTestimonyMode) {
      clearNoAudioAdvance();
    }
  }, [audioTestimonyMode]);

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

  function clearNoAudioAdvance() {
    if (noAudioAdvanceTimeoutRef.current) {
      clearTimeout(noAudioAdvanceTimeoutRef.current);
      noAudioAdvanceTimeoutRef.current = null;
    }
  }

  function scheduleNoAudioAdvance() {
    if (!audioTestimonyMode) return;

    clearNoAudioAdvance();

    noAudioAdvanceTimeoutRef.current = setTimeout(() => {
      const video = videoRef.current as
        | (HTMLVideoElement & {
            mozHasAudio?: boolean;
            webkitAudioDecodedByteCount?: number;
          })
        | null;

      if (!video || video.paused) return;

      const firefoxSaysNoAudio = video.mozHasAudio === false;
      const webkitSaysNoAudio =
        typeof video.webkitAudioDecodedByteCount === "number" &&
        video.webkitAudioDecodedByteCount === 0 &&
        video.currentTime > 1;

      if (firefoxSaysNoAudio || webkitSaysNoAudio) {
        onAudioModeAdvance();
      }
    }, 3500);
  }

  function playVideo() {
    const video = videoRef.current;

    if (!video) return;

    syncVideoMutedState(video);
    video.loop = !audioTestimonyMode;
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

      if (audioTestimonyMode) {
        onAudioModeManualPause();
      }
    }

    clearNoAudioAdvance();
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

  function handleWrapperClick(event: MouseEvent<HTMLDivElement>) {
    if (isControlClick(event.target)) return;
    if (holdPausedRef.current) return;

    togglePlayButton();
  }

  const cleanOverlayText = overlayText?.trim() ?? "";
  const visibleOverlayText =
    cleanOverlayText.toLowerCase() === "none" ? "" : cleanOverlayText;

  return (
    <div
      ref={wrapperRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black [touch-action:pan-y]"
      onClick={handleWrapperClick}
      onPointerDown={(event) => startHoldPause(event.target)}
      onPointerUp={releaseHoldPause}
      onPointerCancel={releaseHoldPause}
      onMouseLeave={releaseHoldPause}
    >
      <div className="relative h-full w-full overflow-hidden bg-black md:mx-auto md:w-[min(100vw,78dvh)] md:max-w-full lg:w-[min(100vw,84dvh)]">
        {shouldLoadVideo ? (
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            muted={!soundOn}
            loop={!audioTestimonyMode}
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-cover object-center transition-transform duration-150 ease-out will-change-transform"
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: "center center",
            }}
            onEnded={() => {
              if (audioTestimonyMode) {
                onAudioModeAdvance();
              }
            }}
            onPlay={() => {
              setPaused(false);
              scheduleNoAudioAdvance();
            }}
            onPause={() => {
              setPaused(true);
              clearNoAudioAdvance();
            }}
            onVolumeChange={() => {
              const video = videoRef.current;

              if (!video) return;

              const nextSoundOn = !video.muted && video.volume > 0;

              if (nextSoundOn !== soundOn) {
                onSoundChange(nextSoundOn);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black text-xs font-black uppercase tracking-[0.18em] text-white/40">
            {copy.loadingVideo}
          </div>
        )}

        <StoryMediaStamp stamp={template} />

        {visibleOverlayText && (
          <VideoCaptionStyleOverlay
            alignment={captionAlign}
            background={captionBackground}
            color={captionColor}
            font={captionFont}
            maxLines={8}
            overlayX={overlayX}
            overlayY={overlayY}
            size={captionSize}
            style={captionStyle}
            text={visibleOverlayText}
          />
        )}
      </div>

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
              className={`flex items-center justify-center rounded-full bg-white text-slate-900 shadow-md ${
                audioTestimonyMode ? "h-16 w-16" : "h-14 w-14"
              }`}
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
              className={`flex items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md ${
                audioTestimonyMode ? "h-14 w-14" : "h-12 w-12"
              }`}
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
  captionHidden,
  story,
  copy,
  onToggleCaption,
}: {
  captionHidden: boolean;
  story: VideoStory;
  copy: VideoFeedCopy;
  onToggleCaption: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const rawStoryText = story.story_text?.trim() || "";
  const storyText = rawStoryText.toLowerCase() === "none" ? "" : rawStoryText;
  const isLongText = storyText.length > 140;

  return (
    <>
      {captionHidden ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCaption();
          }}
          className="absolute bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/15 backdrop-blur-md"
          aria-label="Show caption"
          title={copy.showCaption}
        >
          <Eye className="h-4 w-4" />
        </button>
      ) : (
        <div className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-0 z-30 w-[min(72vw,420px)] overflow-hidden bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4 pb-4">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCaption();
            }}
            className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white/90 ring-1 ring-white/15 backdrop-blur-md"
            aria-label="Hide caption"
            title={copy.hideCaption}
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

            {storyText && (
              <div className="relative mt-1.5 max-w-full overflow-hidden">
                <h1
                  className="mt-1.5 max-w-full text-sm font-black leading-snug text-white md:text-base"
                  style={{
                    display: expanded ? "block" : "-webkit-box",
                    WebkitLineClamp: expanded ? undefined : 3,
                    WebkitBoxOrient: expanded ? undefined : "vertical",
                    overflow: expanded ? "visible" : "hidden",
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
                setExpanded((current) => !current);
              }}
              className="mt-2 inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-900 shadow-md backdrop-blur md:text-xs"
            >
              {expanded ? "Less" : copy.more}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function VideoCaptionStyleOverlay({
  alignment,
  background,
  color,
  font,
  maxLines,
  overlayX,
  overlayY,
  size,
  style,
  text,
}: {
  alignment?: CaptionAlign;
  background?: CaptionBackground;
  color?: CaptionColor;
  font?: CaptionFont;
  maxLines?: number;
  overlayX?: number | null;
  overlayY?: number | null;
  size?: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  return (
    <StoryOverlayText
      alignment={alignment}
      background={background}
      color={color}
      font={font}
      maxLines={maxLines}
      overlayContext="video-feed"
      overlayX={overlayX}
      overlayY={overlayY}
      size={size}
      style={style}
      text={text}
    />
  );
}

function VideoFeedBottomNav({
  onNavTap,
  videosHref,
}: {
  onNavTap: () => void;
  videosHref: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-0 bg-transparent px-3 pb-2 pt-2 shadow-none">
      <div className="mx-auto max-w-lg">
        <div className="grid grid-cols-6 gap-1 rounded-[1.5rem] bg-transparent p-1 ring-1 ring-white/10 backdrop-blur-sm">
          {videoFeedBottomNavItems.map((item) => {
            const Icon = item.icon;
            const isVideosItem = item.label === "Videos";
            const href = isVideosItem ? videosHref : item.href;
            const active = isVideosItem;

            return (
              <Link
                key={item.href}
                href={href}
                onClick={onNavTap}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-2 text-[10px] font-black transition ${
                  active
                    ? "bg-white/15 text-white ring-1 ring-white/15"
                    : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
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

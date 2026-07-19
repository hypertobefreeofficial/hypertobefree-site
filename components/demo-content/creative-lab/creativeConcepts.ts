export const SAMPLE_DEMO_LABEL = "SAMPLE DEMO";

export const FLAGSHIP_STORY = {
  prayerRequest:
    "Please pray that God gives me peace while I wait for a decision that could change my family's next season.",
  imPrayingLabel: "I'm Praying",
  encouragementSupport: "12 people are standing with you in prayer",
  publicResponse:
    "I'm standing with you in prayer. May God give you peace before the answer comes and clarity for whatever door opens.",
  godDidIt:
    "God Did It. The door opened—but the first answer was the peace He gave me while I waited.",
  finalInvitation: "Share the prayer. Stand together. Celebrate what God did.",
} as const;

export type CreativeDirectionId =
  | "cinematic-dawn"
  | "sacred-journal"
  | "living-testimony";

export type FlagshipMomentId =
  | "opening"
  | "prayer-request"
  | "praying-support"
  | "public-response"
  | "god-did-it"
  | "final-invitation";

export type FlagshipMoment = {
  id: FlagshipMomentId;
  label: string;
  start: number;
  end: number;
};

export const FLAGSHIP_MOMENTS: FlagshipMoment[] = [
  { id: "opening", label: "SAMPLE DEMO opening", start: 0, end: 3.5 },
  { id: "prayer-request", label: "Prayer request", start: 3.5, end: 8.5 },
  {
    id: "praying-support",
    label: "I'm Praying and encouragement",
    start: 8.5,
    end: 13.5,
  },
  { id: "public-response", label: "Public response", start: 13.5, end: 18.5 },
  { id: "god-did-it", label: "God Did It update", start: 18.5, end: 23.5 },
  {
    id: "final-invitation",
    label: "HTBF journey invitation",
    start: 23.5,
    end: 28,
  },
];

export const FLAGSHIP_DURATION_SECONDS = 28;

export type AudioRecommendation = {
  narrationStyle: string;
  musicMood: string;
  soundDesign: string;
  textOnlyPreferred: boolean;
  textOnlyRationale: string;
  accessibilityTranscript: string;
};

export type CreativeDirection = {
  id: CreativeDirectionId;
  title: string;
  subtitle: string;
  description: string;
  palette: string[];
  typography: string;
  motionNotes: string;
  audio: AudioRecommendation;
};

export const CREATIVE_DIRECTIONS: CreativeDirection[] = [
  {
    id: "cinematic-dawn",
    title: "Direction A — Cinematic Dawn",
    subtitle: "Warm sunrise hope",
    description:
      "Open-sky atmosphere with soft parallax clouds, ivory and gold light, and restrained editorial type. Hopeful and unmistakably HTBF.",
    palette: ["#FFF8F0", "#F4D9A6", "#7EB6D7", "#C8923E", "#5C4A3A"],
    typography: "Cinzel display + DM Sans body",
    motionNotes:
      "Slow cloud drift, gentle light bloom, cross-fades between story beats.",
    audio: {
      narrationStyle:
        "Warm, calm female or male voice — documentary tone, never salesy.",
      musicMood:
        "Soft orchestral dawn pad with light piano; no dramatic swells until God Did It.",
      soundDesign:
        "Subtle morning ambience at opening; soft chime when support appears.",
      textOnlyPreferred: false,
      textOnlyRationale:
        "Light narration can deepen emotion, but captions must carry the full story.",
      accessibilityTranscript:
        "Full on-screen text plus downloadable transcript mirroring each moment.",
    },
  },
  {
    id: "sacred-journal",
    title: "Direction B — Sacred Journal",
    subtitle: "Premium devotional intimacy",
    description:
      "Layered journal pages, refined handwritten accents, and candlelit warmth without scrapbook clichés.",
    palette: ["#F7F1E8", "#E8D8C4", "#8B7355", "#2F4A62", "#FAF6EF"],
    typography: "Cormorant Garamond + Patrick Hand accents",
    motionNotes:
      "Page turns, ink reveal, soft paper lift — all restrained and tactile.",
    audio: {
      narrationStyle:
        "Intimate first-person reading, as if journaling aloud — gentle pace.",
      musicMood:
        "Minimal acoustic guitar or soft piano in a reflective key; very sparse.",
      soundDesign:
        "Paper turn at transitions; faint pencil stroke when prayer appears.",
      textOnlyPreferred: true,
      textOnlyRationale:
        "Silence and typography can feel more personal for journal intimacy.",
      accessibilityTranscript:
        "Structured transcript with moment headings; optional narration track later.",
    },
  },
  {
    id: "living-testimony",
    title: "Direction C — Living Testimony",
    subtitle: "Modern community motion",
    description:
      "Full-screen social storytelling with kinetic captions and purposeful transitions — energetic yet reverent.",
    palette: ["#F8FBFF", "#1E3A5F", "#4A90D9", "#E8C170", "#0F172A"],
    typography: "Montserrat headlines + DM Sans UI",
    motionNotes:
      "Kinetic type, card slides, reaction chips — each beat shows community flow.",
    audio: {
      narrationStyle:
        "Confident, friendly guide voice — explains HTBF journey without hype.",
      musicMood:
        "Modern faith-pop instrumental; mid-tempo, uplifting on God Did It beat.",
      soundDesign:
        "Soft UI taps when support appears; gentle whoosh between beats.",
      textOnlyPreferred: false,
      textOnlyRationale:
        "Motion-forward direction benefits from voice guiding the community story.",
      accessibilityTranscript:
        "Caption-first with full text for every kinetic line; no essential info in motion alone.",
    },
  },
];

export function getCreativeDirection(id: CreativeDirectionId): CreativeDirection {
  const direction = CREATIVE_DIRECTIONS.find((entry) => entry.id === id);
  if (!direction) {
    throw new Error(`Unknown creative direction: ${id}`);
  }
  return direction;
}

export function listCreativeDirectionIds(): CreativeDirectionId[] {
  return CREATIVE_DIRECTIONS.map((direction) => direction.id);
}

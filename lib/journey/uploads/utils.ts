import type {
  EncouragementImpact,
  JourneyUpload,
  ReactionRow,
  StoryReactionTotals,
  UploadSort,
  UploadStatusFilter,
  UploadTypeFilter,
} from "./types";

export function formatUploadDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatUploadDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getUploadTitle(upload: JourneyUpload) {
  const text = upload.story_text?.trim();
  if (text) {
    const firstLine = text.split(/\n/)[0]?.trim() || text;
    return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
  }

  return upload.story_type?.trim() || "HTBF Upload";
}

export function getUploadPreview(upload: JourneyUpload, max = 120) {
  const text = upload.story_text?.trim() || "";
  if (!text) return "No description added yet.";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function getUploadStatus(upload: JourneyUpload) {
  const status = upload.status?.toLowerCase() || "pending";
  if (status === "approved") return "approved";
  if (status === "removed") return "removed";
  return "pending";
}

export function getContentTypeLabel(upload: JourneyUpload) {
  const type = (upload.story_type || "").toLowerCase();
  if (type.includes("prayer")) return "Prayer Request";
  if (type.includes("praise")) return "Praise Report";
  if (type.includes("testimony") || type.includes("video")) {
    return upload.video_url ? "Testimony (Video)" : "Testimony";
  }
  if (type.includes("story")) return "Story";
  return upload.story_type?.trim() || "Other";
}

export function normalizeContentBucket(upload: JourneyUpload): UploadTypeFilter {
  const type = (upload.story_type || "").toLowerCase();
  if (type.includes("prayer")) return "prayer";
  if (type.includes("praise")) return "praise";
  if (type.includes("testimony")) return "testimony";
  if (type.includes("story")) return "story";
  return "other";
}

export function buildReactionTotalsByStory(
  reactions: ReactionRow[],
  storyIds: string[]
) {
  const allowed = new Set(storyIds);
  const map = new Map<string, StoryReactionTotals>();

  reactions.forEach((reaction) => {
    const storyId = reaction.story_id;
    if (!storyId || !allowed.has(storyId)) return;

    const current = map.get(storyId) ?? {
      total: 0,
      amen: 0,
      praiseGod: 0,
      encouraged: 0,
      praying: 0,
    };

    current.total += 1;
    if (reaction.reaction_type === "amen") current.amen += 1;
    if (reaction.reaction_type === "praise_god") current.praiseGod += 1;
    if (reaction.reaction_type === "encouraged") current.encouraged += 1;
    if (reaction.reaction_type === "praying") current.praying += 1;

    map.set(storyId, current);
  });

  return map;
}

export function getMostRespondedUpload(
  uploads: JourneyUpload[],
  totals: Map<string, StoryReactionTotals>
) {
  let best: JourneyUpload | null = null;
  let bestCount = 0;

  uploads.forEach((upload) => {
    const count = totals.get(upload.id)?.total ?? 0;
    if (count > bestCount) {
      best = upload;
      bestCount = count;
    }
  });

  return bestCount > 0 ? { upload: best, count: bestCount } : null;
}

export function getTopResponseContentType(
  uploads: JourneyUpload[],
  totals: Map<string, StoryReactionTotals>
) {
  const buckets = new Map<string, number>();

  uploads.forEach((upload) => {
    const count = totals.get(upload.id)?.total ?? 0;
    if (count === 0) return;
    const label = getContentTypeLabel(upload);
    buckets.set(label, (buckets.get(label) ?? 0) + count);
  });

  let topLabel: string | null = null;
  let topCount = 0;

  buckets.forEach((count, label) => {
    if (count > topCount) {
      topLabel = label;
      topCount = count;
    }
  });

  return topLabel && topCount > 0 ? { label: topLabel, count: topCount } : null;
}

export function filterUploads(
  uploads: JourneyUpload[],
  statusFilter: UploadStatusFilter,
  typeFilter: UploadTypeFilter,
  query: string
) {
  const cleanQuery = query.trim().toLowerCase();

  return uploads.filter((upload) => {
    const status = getUploadStatus(upload);
    const hasVideo = Boolean(upload.video_url);

    if (statusFilter === "approved" && status !== "approved") return false;
    if (statusFilter === "pending" && status !== "pending") return false;
    if (statusFilter === "removed" && status !== "removed") return false;
    if (statusFilter === "videos" && !hasVideo) return false;

    if (typeFilter === "answered") {
      if (
        !(
          (upload.story_type || "").toLowerCase().includes("prayer") &&
          upload.prayer_status === "answered"
        )
      ) {
        return false;
      }
    } else if (typeFilter === "edited") {
      if (!upload.edited_at) return false;
    } else if (typeFilter === "text") {
      if (hasVideo) return false;
    } else if (typeFilter !== "all") {
      if (normalizeContentBucket(upload) !== typeFilter) return false;
    }

    if (!cleanQuery) return true;

    const haystack = [
      upload.story_type,
      upload.story_text,
      upload.status,
      upload.name,
      upload.location,
      upload.answered_text,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(cleanQuery);
  });
}

export function sortUploads(
  uploads: JourneyUpload[],
  sort: UploadSort,
  reactionTotals: Map<string, StoryReactionTotals>
) {
  const next = [...uploads];
  const time = (value: string | null | undefined) => {
    const stamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  };

  next.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return time(a.created_at) - time(b.created_at);
      case "edited":
        return time(b.edited_at) - time(a.edited_at);
      case "responses":
        return (
          (reactionTotals.get(b.id)?.total ?? 0) -
          (reactionTotals.get(a.id)?.total ?? 0)
        );
      case "status":
        return getUploadStatus(a).localeCompare(getUploadStatus(b));
      case "type":
        return getContentTypeLabel(a).localeCompare(getContentTypeLabel(b));
      case "newest":
      default:
        return time(b.created_at) - time(a.created_at);
    }
  });

  return next;
}

export function buildUploadTimeline(uploads: JourneyUpload[]) {
  if (uploads.length === 0) {
    return {
      firstUploadAt: null as string | null,
      latestUploadAt: null as string | null,
      months: [] as { key: string; label: string; count: number }[],
      approvedCount: 0,
      answeredCount: 0,
    };
  }

  const sorted = [...uploads].sort(
    (a, b) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime()
  );

  const monthMap = new Map<string, number>();

  uploads.forEach((upload) => {
    if (!upload.created_at) return;
    const date = new Date(upload.created_at);
    if (!Number.isFinite(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  });

  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split("-");
      const label = new Intl.DateTimeFormat(undefined, {
        month: "short",
        year: "numeric",
      }).format(new Date(Number(year), Number(month) - 1, 1));
      return { key, label, count };
    });

  return {
    firstUploadAt: sorted[0]?.created_at ?? null,
    latestUploadAt: sorted[sorted.length - 1]?.created_at ?? null,
    months,
    approvedCount: uploads.filter((u) => getUploadStatus(u) === "approved")
      .length,
    answeredCount: uploads.filter(
      (u) =>
        (u.story_type || "").toLowerCase().includes("prayer") &&
        u.prayer_status === "answered"
    ).length,
  };
}

export function getPublicViewHref(upload: JourneyUpload) {
  if (getUploadStatus(upload) !== "approved") return null;
  if (upload.video_url) {
    return `/video-feed?story=${upload.id}&from=control-center`;
  }
  return `/feed`;
}

export function summarizeImpact(
  impact: EncouragementImpact
): EncouragementImpact {
  return impact;
}

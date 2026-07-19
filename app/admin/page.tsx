"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  EyeOff,
  FileText,
  Flag,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCircle,
  Video,
  XCircle,
} from "lucide-react";
import { moderatorDurationNotice, MANUAL_DURATION_ACK_COPY } from "../../lib/prayer-connect/responsePublication";
import {
  adminParentContentLabel,
  adminParentOwnerLabel,
  adminResponseTypeLabel,
  resolveResponseContextFromStory,
} from "../../lib/responses/publicVideoResponseContext";
import {
  presentVideoResponseAiReview,
  resolveAdminParentContentText,
} from "../../lib/responses/videoResponseAiReview";
import { responseNeedsAdminAttention } from "../../lib/responses/videoResponseAdminQueue";
import { supabase } from "../../lib/supabaseClient";
import {
  ADMIN_REPORTS_PAGE_LIMIT,
  ADMIN_STORIES_PAGE_LIMIT,
  buildAdminKeysetOrFilter,
  decodeAdminListCursor,
  nextAdminCursorFromRows,
} from "../../lib/admin/adminPagination";
import {
  createLoadTraceId,
  measureLoad,
} from "../../lib/perf/loadDiagnostics";
import {
  applyGenuinePublicModerationFilter,
  filterGenuinePublicModerationRows,
} from "../../lib/demo-content/moderationIsolation";
import { getDemoContentSchemaCapabilities } from "../../lib/demo-content/eligibility";
import { shouldDeliverInboxNotification } from "../../lib/demo-content/notificationIsolation";

const storyFilters: { label: string; value: StoryFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Removed", value: "removed" },
  { label: "Videos", value: "videos" },
  { label: "Photos", value: "photos" },
  { label: "Prayer", value: "prayer" },
  { label: "Testimonies", value: "testimonies" },
  { label: "Praise", value: "praise" },
];

type Story = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  ai_review_status: string | null;
  ai_risk_level: string | null;
  ai_suggested_action: string | null;
  ai_flags: string[] | null;
  created_at: string | null;
};

type StoryFilter =
  | "all"
  | "pending"
  | "approved"
  | "removed"
  | "videos"
  | "photos"
  | "prayer"
  | "testimonies"
  | "praise";

type ContentReport = {
  id: string;
  story_id: string | null;
  prayer_video_response_id: string | null;
  reporter_user_id: string | null;
  reported_user_id: string | null;
  reason: string | null;
  details: string | null;
  status: string | null;
  admin_notes: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  story?: Story | null;
};

type AccountDeletionRequest = {
  id: string;
  user_id: string;
  email: string | null;
  reason: string | null;
  status: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string | null;
};

type PrayerVideoResponseStatus = "approved" | "rejected" | "removed";

type PrayerVideoResponse = {
  response_id: string;
  story_id: string;
  response_user_id: string;
  video_url: string;
  body: string | null;
  status: string;
  created_at: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  hidden_at: string | null;
  removed_at: string | null;
  duration_verification_status?: string | null;
  prayer_text: string | null;
  prayer_owner_user_id: string | null;
  prayer_owner_name: string | null;
  prayer_owner_display_name: string | null;
  prayer_owner_username: string | null;
  prayer_owner_avatar_url: string | null;
  response_author_display_name: string | null;
  response_author_username: string | null;
  response_author_avatar_url: string | null;
  response_context?: string | null;
  parent_story_type?: string | null;
  parent_story_text?: string | null;
  parent_story_missing?: boolean;
  parent_owner_display_name?: string | null;
  parent_owner_username?: string | null;
  ai_review_status?: string | null;
  ai_risk_level?: string | null;
  ai_suggested_action?: string | null;
  ai_summary?: string | null;
  ai_flags?: string[] | null;
};

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<
    AccountDeletionRequest[]
  >([]);
  const [prayerVideoResponses, setPrayerVideoResponses] = useState<
    PrayerVideoResponse[]
  >([]);
  const [prayerResponseVideoUrls, setPrayerResponseVideoUrls] = useState<
    Record<string, string>
  >({});
  const [storyImageUrls, setStoryImageUrls] = useState<Record<string, string>>(
    {}
  );
  const [blockedUsersCount, setBlockedUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<StoryFilter>("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [moderatingResponseId, setModeratingResponseId] = useState<string | null>(
    null
  );
  const [storiesNextCursor, setStoriesNextCursor] = useState<string | null>(
    null
  );
  const [storiesHasMore, setStoriesHasMore] = useState(false);
  const [loadingMoreStories, setLoadingMoreStories] = useState(false);
  const [reportsNextCursor, setReportsNextCursor] = useState<string | null>(
    null
  );
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);

  useEffect(() => {
    loadAdminPage();
  }, []);

  async function loadAdminPage() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setEmail(user.email ?? null);

    const { data: isAdmin, error: adminAccessError } = await supabase.rpc(
      "current_user_is_admin"
    );

    if (adminAccessError || isAdmin !== true) {
      if (adminAccessError) {
        console.error("Could not verify admin access:", adminAccessError);
      }

      window.location.replace("/feed");
      return;
    }

    await Promise.all([
      loadStories(),
      loadReports(),
      loadDeletionRequests(),
      loadPrayerVideoResponses(),
      loadBlockedUsersCount(),
    ]);

    setLoading(false);
  }

  async function loadStories(options?: {
    cursor?: string | null;
    append?: boolean;
  }) {
    const limit = ADMIN_STORIES_PAGE_LIMIT;
    const cursor = decodeAdminListCursor(options?.cursor);

    const demoCapabilities = await getDemoContentSchemaCapabilities();
    let query = supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, image_url, video_url, thumbnail_url, status, ai_review_status, ai_risk_level, ai_suggested_action, ai_flags, created_at, is_demo"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    query = applyGenuinePublicModerationFilter(query, "stories", demoCapabilities);

    if (cursor) {
      query = query.or(buildAdminKeysetOrFilter(cursor));
    }

    const { data, error } = await measureLoad(
      "admin",
      options?.append ? "stories-page" : "stories-initial",
      createLoadTraceId("admin-stories"),
      async () => query,
      { recordsFetched: limit, dbQueries: 1 }
    );

    if (error) {
      setMessage(`Could not load stories: ${error.message}`);
      return;
    }

    const loadedStories = filterGenuinePublicModerationRows(
      ((data as Story[]) ?? []) as Array<Story & { is_demo?: boolean | null }>
    );
    const pagination = nextAdminCursorFromRows(loadedStories, limit);

    setStories((current) =>
      options?.append ? [...current, ...loadedStories] : loadedStories
    );
    setStoriesNextCursor(pagination.nextCursor);
    setStoriesHasMore(pagination.hasMore);
    void loadStoryImageUrls(
      options?.append
        ? loadedStories
        : loadedStories
    );
  }

  async function loadMoreStories() {
    if (!storiesHasMore || !storiesNextCursor || loadingMoreStories) return;

    setLoadingMoreStories(true);
    try {
      await loadStories({
        cursor: storiesNextCursor,
        append: true,
      });
    } finally {
      setLoadingMoreStories(false);
    }
  }

  async function loadBlockedUsersCount() {
    const { count, error } = await supabase
      .from("blocked_users")
      .select("blocker_user_id", { count: "exact", head: true });

    if (error) {
      console.error("Could not load blocked users count:", error);
      return;
    }

    setBlockedUsersCount(count ?? 0);
  }

  async function loadPrayerVideoResponses(): Promise<PrayerVideoResponse[]> {
    const demoCapabilities = await getDemoContentSchemaCapabilities();
    const { data, error } = await supabase.rpc(
      "list_prayer_video_responses_for_admin"
    );

    if (error) {
      setMessage(`Could not load prayer video responses: ${error.message}`);
      return [];
    }

    const rawResponses: unknown[] = Array.isArray(data) ? data : [];
    let loadedResponses = rawResponses
      .map(toPrayerVideoResponse)
      .filter(
        (response): response is PrayerVideoResponse => response !== null
      );

    const responseIds = loadedResponses.map((item) => item.response_id);
    if (responseIds.length > 0) {
      const { data: moderationRows, error: moderationError } =
        await applyGenuinePublicModerationFilter(
          supabase
            .from("prayer_video_responses")
            .select(
              "id, duration_verification_status, response_context, ai_review_status, ai_risk_level, ai_suggested_action, ai_summary, ai_flags, is_demo"
            )
            .in("id", responseIds),
          "prayer_video_responses",
          demoCapabilities
        );

      if (moderationError) {
        console.error(
          "Could not load response moderation fields:",
          moderationError.message
        );
      }

      const moderationMap = new Map(
        filterGenuinePublicModerationRows(
          ((moderationRows as {
            id: string;
            duration_verification_status: string | null;
            response_context: string | null;
            ai_review_status: string | null;
            ai_risk_level: string | null;
            ai_suggested_action: string | null;
            ai_summary: string | null;
            ai_flags: string[] | null;
            is_demo?: boolean | null;
          }[]) ?? []) as Array<{
            id: string;
            duration_verification_status: string | null;
            response_context: string | null;
            ai_review_status: string | null;
            ai_risk_level: string | null;
            ai_suggested_action: string | null;
            ai_summary: string | null;
            ai_flags: string[] | null;
            is_demo?: boolean | null;
          }>
        ).map((row) => [row.id, row])
      );

      const genuineResponses = loadedResponses.filter((response) => {
        const moderation = moderationMap.get(response.response_id);
        return moderation !== undefined;
      });

      const storyIds = [...new Set(genuineResponses.map((item) => item.story_id))];
      const { data: parentStories, error: parentStoriesError } =
        await applyGenuinePublicModerationFilter(
          supabase
            .from("stories")
            .select(
              "id, story_type, story_text, user_id, name, status, removed_at, is_demo"
            )
            .in("id", storyIds),
          "stories",
          demoCapabilities
        );

      if (parentStoriesError) {
        console.error(
          "Could not load parent stories for video responses:",
          parentStoriesError.message
        );
      }

      const parentStoryMap = new Map(
        filterGenuinePublicModerationRows(
          ((parentStories as {
            id: string;
            story_type: string | null;
            story_text: string | null;
            user_id: string | null;
            name: string | null;
            status: string | null;
            removed_at: string | null;
            is_demo?: boolean | null;
          }[]) ?? []) as Array<{
            id: string;
            story_type: string | null;
            story_text: string | null;
            user_id: string | null;
            name: string | null;
            status: string | null;
            removed_at: string | null;
            is_demo?: boolean | null;
          }>
        ).map((story) => [story.id, story])
      );

      const parentOwnerIds = [
        ...new Set(
          [...parentStoryMap.values()]
            .map((story) => story.user_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      const parentOwnerMap = new Map<
        string,
        { display_name: string | null; username: string | null }
      >();

      if (parentOwnerIds.length > 0) {
        const { data: parentProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", parentOwnerIds);

        ((parentProfiles as {
          id: string;
          display_name: string | null;
          username: string | null;
        }[]) ?? []).forEach((profile) => {
          parentOwnerMap.set(profile.id, {
            display_name: profile.display_name,
            username: profile.username,
          });
        });
      }

      genuineResponses.forEach((response) => {
        const moderation = moderationMap.get(response.response_id);
        const parentStory = parentStoryMap.get(response.story_id);

        response.duration_verification_status =
          moderation?.duration_verification_status ?? "unavailable";
        response.response_context =
          moderation?.response_context ??
          resolveResponseContextFromStory({
            story_type: parentStory?.story_type ?? response.parent_story_type ?? null,
          });
        response.parent_story_type =
          parentStory?.story_type ?? response.parent_story_type ?? null;
        response.parent_story_text = parentStory?.story_text ?? null;
        response.parent_story_missing = false;
        response.ai_review_status = moderation?.ai_review_status ?? null;
        response.ai_risk_level = moderation?.ai_risk_level ?? null;
        response.ai_suggested_action = moderation?.ai_suggested_action ?? null;
        response.ai_summary = moderation?.ai_summary ?? null;
        response.ai_flags = Array.isArray(moderation?.ai_flags)
          ? moderation.ai_flags.filter(
              (flag): flag is string => typeof flag === "string"
            )
          : null;

        const parentOwnerId =
          parentStory?.user_id ?? response.prayer_owner_user_id ?? null;
        const parentOwnerProfile = parentOwnerId
          ? parentOwnerMap.get(parentOwnerId)
          : null;

        response.parent_owner_display_name =
          parentOwnerProfile?.display_name ??
          response.prayer_owner_display_name ??
          parentStory?.name ??
          response.prayer_owner_name ??
          null;
        response.parent_owner_username =
          parentOwnerProfile?.username ?? response.prayer_owner_username ?? null;
      });
      loadedResponses = genuineResponses;
    }

    setPrayerVideoResponses(loadedResponses);
    await loadPrayerResponseVideoUrls(loadedResponses);
    return loadedResponses;
  }

  async function loadReports(options?: {
    cursor?: string | null;
    append?: boolean;
  }) {
    const limit = ADMIN_REPORTS_PAGE_LIMIT;
    const cursor = decodeAdminListCursor(options?.cursor);

    const demoCapabilities = await getDemoContentSchemaCapabilities();
    let query = supabase
      .from("content_reports")
      .select(
        "id, story_id, prayer_video_response_id, reporter_user_id, reported_user_id, reason, details, status, admin_notes, created_at, reviewed_at, reviewed_by, is_demo"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    query = applyGenuinePublicModerationFilter(
      query,
      "content_reports",
      demoCapabilities
    );

    if (cursor) {
      query = query.or(buildAdminKeysetOrFilter(cursor));
    }

    const { data, error } = await measureLoad(
      "admin",
      options?.append ? "reports-page" : "reports-initial",
      createLoadTraceId("admin-reports"),
      async () => query,
      { recordsFetched: limit, dbQueries: 1 }
    );

    if (error) {
      setMessage(`Could not load reports: ${error.message}`);
      return;
    }

    const baseReports = filterGenuinePublicModerationRows(
      ((data as ContentReport[]) ?? []) as Array<
        ContentReport & { is_demo?: boolean | null }
      >
    );
    const pagination = nextAdminCursorFromRows(baseReports, limit);

    const storyIds = baseReports
      .map((report) => report.story_id)
      .filter((id): id is string => Boolean(id));

    let reportsWithStories = baseReports;

    if (storyIds.length > 0) {
      const { data: storyData, error: storyError } = await applyGenuinePublicModerationFilter(
        supabase
          .from("stories")
          .select(
            "id, user_id, name, email, location, story_type, story_text, image_url, video_url, thumbnail_url, status, ai_review_status, ai_risk_level, ai_suggested_action, ai_flags, created_at, is_demo"
          )
          .in("id", storyIds),
        "stories",
        demoCapabilities
      );

      if (storyError) {
        setMessage(`Could not load reported stories: ${storyError.message}`);
      } else {
        const storyMap = new Map(
          filterGenuinePublicModerationRows(
            ((storyData as Story[]) ?? []) as Array<
              Story & { is_demo?: boolean | null }
            >
          ).map((story) => [story.id, story])
        );

        reportsWithStories = baseReports.map((report) => ({
          ...report,
          story: report.story_id ? storyMap.get(report.story_id) ?? null : null,
        }));
      }
    }

    setReports((current) =>
      options?.append ? [...current, ...reportsWithStories] : reportsWithStories
    );
    setReportsNextCursor(pagination.nextCursor);
    setReportsHasMore(pagination.hasMore);
  }

  async function loadMoreReports() {
    if (!reportsHasMore || !reportsNextCursor || loadingMoreReports) return;

    setLoadingMoreReports(true);
    try {
      await loadReports({
        cursor: reportsNextCursor,
        append: true,
      });
    } finally {
      setLoadingMoreReports(false);
    }
  }

  async function loadDeletionRequests() {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select(
        "id, user_id, email, reason, status, admin_notes, reviewed_at, reviewed_by, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load account deletion requests: ${error.message}`);
      return;
    }

    setDeletionRequests((data as AccountDeletionRequest[]) ?? []);
  }

  function openVideoReviewPage(storyId: string | null | undefined) {
    if (!storyId) {
      setMessage("No story ID found for this video.");
      return;
    }

    window.open(
      `/admin/video-review?story=${storyId}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function getStoryImageStoragePath(imageUrl: string | null) {
    if (!imageUrl) return null;

    if (imageUrl.includes("story-images/")) {
      const afterBucket = imageUrl.split("story-images/")[1];
      const pathOnly = afterBucket.split("?")[0];

      return decodeURIComponent(pathOnly);
    }

    if (imageUrl.startsWith("http")) return null;

    return imageUrl;
  }

  function getPrayerResponseVideoStoragePath(videoUrl: string) {
    if (videoUrl.includes("story-videos/")) {
      const afterBucket = videoUrl.split("story-videos/")[1];
      const pathOnly = afterBucket.split("?")[0];

      try {
        return decodeURIComponent(pathOnly);
      } catch {
        return pathOnly;
      }
    }

    if (videoUrl.startsWith("http")) return null;

    return videoUrl.replace(/^\/+/, "");
  }

  async function loadPrayerResponseVideoUrls(
    responses: PrayerVideoResponse[]
  ) {
    const nextVideoUrls: Record<string, string> = {};

    await Promise.all(
      responses.map(async (response) => {
        if (response.video_url.startsWith("http")) {
          nextVideoUrls[response.response_id] = response.video_url;
          return;
        }

        const storagePath = getPrayerResponseVideoStoragePath(
          response.video_url
        );

        if (!storagePath) return;

        const { data, error } = await supabase.storage
          .from("story-videos")
          .createSignedUrl(storagePath, 60 * 60);

        if (!error && data?.signedUrl) {
          nextVideoUrls[response.response_id] = data.signedUrl;
        }
      })
    );

    setPrayerResponseVideoUrls(nextVideoUrls);
  }

  async function loadStoryImageUrls(loadedStories: Story[]) {
    const nextImageUrls: Record<string, string> = {};

    await Promise.all(
      loadedStories.map(async (story) => {
        if (!story.image_url) return;

        if (story.image_url.startsWith("http")) {
          nextImageUrls[story.id] = story.image_url;
          return;
        }

        const storagePath = getStoryImageStoragePath(story.image_url);

        if (!storagePath) return;

        const { data, error } = await supabase.storage
          .from("story-images")
          .createSignedUrl(storagePath, 60 * 60);

        if (!error && data?.signedUrl) {
          nextImageUrls[story.id] = data.signedUrl;
        }
      })
    );

    setStoryImageUrls(nextImageUrls);
  }

  async function createApprovalInboxMessage(
    story: (Story & { is_demo?: boolean | null }) | null | undefined
  ) {
    if (!story?.user_id) return;
    if (
      !shouldDeliverInboxNotification({
        story,
        recipient: { is_demo: story.is_demo ?? null },
      })
    ) {
      return;
    }

    const { data: existingMessages, error: existingError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("user_id", story.user_id)
      .eq("story_id", story.id)
      .eq("message_type", "story_approved")
      .limit(1);

    if (existingError) {
      console.error("Could not check approval inbox message:", existingError);
      return;
    }

    if (Array.isArray(existingMessages) && existingMessages.length > 0) return;

    const { error } = await supabase.from("inbox_messages").insert({
      user_id: story.user_id,
      title: "Your post was approved",
      body: "Your post has been approved and is now live on HTBF.",
      category: "approval",
      message_type: "story_approved",
      story_id: story.id,
      action_url: "/feed",
      read: false,
    });

    if (error) {
      console.error("Could not create approval inbox message:", error);
    }
  }

  async function updateStoryStatus(storyId: string, newStatus: string) {
    setMessage("");

    const storyToUpdate =
      stories.find((story) => story.id === storyId) ??
      reports.find((report) => report.story?.id === storyId)?.story ??
      null;

    const { error } = await supabase
      .from("stories")
      .update({ status: newStatus })
      .eq("id", storyId);

    if (error) {
      setMessage(`Could not update story: ${error.message}`);
      return;
    }

    if (newStatus === "approved") {
      await createApprovalInboxMessage(storyToUpdate);
    }

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === storyId ? { ...story, status: newStatus } : story
      )
    );

    setReports((currentReports) =>
      currentReports.map((report) =>
        report.story?.id === storyId
          ? {
              ...report,
              story: {
                ...report.story,
                status: newStatus,
              },
            }
          : report
      )
    );

    setMessage(`Story marked as ${newStatus.replace("_", " ")}.`);
  }

  async function moderatePrayerVideoResponse(
    responseId: string,
    nextStatus: PrayerVideoResponseStatus,
    options?: { acknowledgeUnverifiedDuration?: boolean }
  ) {
    if (moderatingResponseId) return;

    const target = prayerVideoResponses.find(
      (response) => response.response_id === responseId
    );
    const responseLabel = adminResponseTypeLabel(target?.response_context).toLowerCase();

    if (
      nextStatus === "removed" &&
      !window.confirm(`Remove this public ${responseLabel}?`)
    ) {
      return;
    }

    let acknowledgeUnverifiedDuration =
      options?.acknowledgeUnverifiedDuration === true;

    if (
      nextStatus === "approved" &&
      !acknowledgeUnverifiedDuration &&
      (target?.duration_verification_status ?? "unavailable") === "unavailable" &&
      !window.confirm(MANUAL_DURATION_ACK_COPY)
    ) {
      return;
    }

    if (
      nextStatus === "approved" &&
      (target?.duration_verification_status ?? "unavailable") === "unavailable"
    ) {
      acknowledgeUnverifiedDuration = true;
    }

    setMessage("");
    setModeratingResponseId(responseId);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setModeratingResponseId(null);
      setMessage("Please sign in again to moderate responses.");
      return;
    }

    let payload: {
      ok?: boolean;
      error?: string;
      status?: string;
      durationVerificationStatus?: string;
      requiresManualAck?: boolean;
      manualAckCopy?: string;
    } | null = null;

    try {
      const response = await fetch("/api/moderate-prayer-video-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          response_id: responseId,
          next_status: nextStatus,
          acknowledge_unverified_duration: acknowledgeUnverifiedDuration,
        }),
      });
      payload = (await response.json().catch(() => null)) as typeof payload;

      if (!response.ok || payload?.ok === false) {
        if (payload?.requiresManualAck && nextStatus === "approved") {
          const acknowledged = window.confirm(
            payload.manualAckCopy ?? MANUAL_DURATION_ACK_COPY
          );
          if (acknowledged) {
            setModeratingResponseId(null);
            await moderatePrayerVideoResponse(responseId, nextStatus, {
              acknowledgeUnverifiedDuration: true,
            });
            return;
          }
        }

        setMessage(
          payload?.error ??
            "Could not update this response. Please review duration verification and try again."
        );
        return;
      }
    } catch {
      setMessage("Could not reach the moderation server.");
      return;
    } finally {
      setModeratingResponseId(null);
    }

    if (payload?.status !== nextStatus) {
      setMessage(
        "Approval did not persist. The server did not confirm the new status."
      );
      await loadPrayerVideoResponses();
      return;
    }

    const reloaded = await loadPrayerVideoResponses();
    const verified = reloaded.find((entry) => entry.response_id === responseId);

    if (verified?.status !== nextStatus) {
      setMessage(
        `Approval did not persist. Database still shows "${verified?.status ?? "unknown"}".`
      );
      return;
    }

    setMessage(
      `${adminResponseTypeLabel(target?.response_context)} marked as ${nextStatus.replace("_", " ")}.`
    );
  }

  async function markReportReviewing(reportId: string) {
    setMessage("");

    const { error } = await supabase.rpc("admin_mark_report_reviewing", {
      report_id: reportId,
    });

    if (error) {
      setMessage(`Could not mark report as reviewing: ${error.message}`);
      return;
    }

    setReports((currentReports) =>
      currentReports.map((report) =>
        report.id === reportId
          ? {
              ...report,
              status: "reviewing",
              admin_notes:
                report.admin_notes || "Report marked as reviewing by admin.",
            }
          : report
      )
    );

    setMessage("Report marked as reviewing.");
  }

  async function dismissReport(reportId: string) {
    setMessage("");

    const { error } = await supabase.rpc("admin_dismiss_content_report", {
      report_id: reportId,
    });

    if (error) {
      setMessage(`Could not dismiss report: ${error.message}`);
      return;
    }

    setReports((currentReports) =>
      currentReports.map((report) =>
        report.id === reportId
          ? {
              ...report,
              status: "dismissed",
              reviewed_at: new Date().toISOString(),
              admin_notes: report.admin_notes || "Report dismissed by admin.",
            }
          : report
      )
    );

    setMessage("Report dismissed. The content remains public.");
  }

  async function removeReportedContent(report: ContentReport) {
    setMessage("");

    if (report.prayer_video_response_id) {
      const confirmed = window.confirm(
        "Remove this reported public prayer video response? The parent prayer and private Journey Inbox videos will not be affected."
      );

      if (!confirmed) return;

      const { error: removeResponseError } = await supabase.rpc(
        "moderate_prayer_video_response",
        {
          response_id: report.prayer_video_response_id,
          next_status: "removed",
        }
      );

      if (removeResponseError) {
        setMessage(
          `Could not remove reported prayer response: ${removeResponseError.message}`
        );
        return;
      }

      const { error: closeReportError } = await supabase.rpc(
        "admin_dismiss_content_report",
        { report_id: report.id }
      );

      if (closeReportError) {
        setMessage(
          `Prayer response was removed, but the report could not be closed: ${closeReportError.message}`
        );
        return;
      }

      const reviewedAt = new Date().toISOString();

      setPrayerVideoResponses((currentResponses) =>
        currentResponses.map((response) =>
          response.response_id === report.prayer_video_response_id
            ? {
                ...response,
                status: "removed",
                moderated_at: reviewedAt,
                removed_at: reviewedAt,
              }
            : response
        )
      );
      setReports((currentReports) =>
        currentReports.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: "dismissed",
                reviewed_at: reviewedAt,
                admin_notes:
                  item.admin_notes ||
                  "Reported public prayer response removed by admin.",
              }
            : item
        )
      );
      setMessage("Reported public prayer response removed.");
      return;
    }

    const confirmed = window.confirm(
      "Remove this reported content from public view? This will mark the story as removed and close the report as action taken."
    );

    if (!confirmed) return;

    const { error } = await supabase.rpc("admin_remove_reported_story", {
      report_id: report.id,
    });

    if (error) {
      setMessage(`Could not remove reported content: ${error.message}`);
      return;
    }

    setReports((currentReports) =>
      currentReports.map((item) =>
        item.id === report.id
          ? {
              ...item,
              status: "action_taken",
              reviewed_at: new Date().toISOString(),
              admin_notes:
                item.admin_notes || "Reported content removed by admin.",
              story: item.story
                ? {
                    ...item.story,
                    status: "removed",
                  }
                : item.story,
            }
          : item
      )
    );

    if (report.story_id) {
      setStories((currentStories) =>
        currentStories.map((story) =>
          story.id === report.story_id ? { ...story, status: "removed" } : story
        )
      );
    }

    setMessage("Reported content removed and report marked as action taken.");
  }

  async function markDeletionReviewing(requestId: string) {
    setMessage("");

    const { error } = await supabase
      .from("account_deletion_requests")
      .update({
        status: "reviewing",
        reviewed_by: null,
        admin_notes: "Account deletion request marked as reviewing by admin.",
      })
      .eq("id", requestId);

    if (error) {
      setMessage(`Could not mark deletion request as reviewing: ${error.message}`);
      return;
    }

    setDeletionRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: "reviewing",
              admin_notes:
                request.admin_notes ||
                "Account deletion request marked as reviewing by admin.",
            }
          : request
      )
    );

    setMessage("Account deletion request marked as reviewing.");
  }

  async function completeDeletionRequest(requestId: string) {
    setMessage("");

    const confirmed = window.confirm(
      "Mark this account deletion request as completed? This only closes the request. It does not delete the user yet."
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("account_deletion_requests")
      .update({
        status: "completed",
        reviewed_at: new Date().toISOString(),
        admin_notes:
          "Account deletion request marked completed by admin. Actual account deletion must be handled separately.",
      })
      .eq("id", requestId);

    if (error) {
      setMessage(`Could not complete deletion request: ${error.message}`);
      return;
    }

    setDeletionRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: "completed",
              reviewed_at: new Date().toISOString(),
              admin_notes:
                "Account deletion request marked completed by admin. Actual account deletion must be handled separately.",
            }
          : request
      )
    );

    setMessage(
      "Account deletion request marked completed. Account deletion itself has not been automated yet."
    );
  }

  function formatDate(value: string | null) {
    if (!value) return "Date unavailable";

    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function statusLabel(status: string | null) {
    if (!status) return "pending";
    return status.replace("_", " ");
  }

  function reasonLabel(reason: string | null) {
    if (!reason) return "Not provided";

    const labels: Record<string, string> = {
      inappropriate: "Inappropriate content",
      harassment_hate: "Harassment or hate",
      violence_harm: "Violence or harmful content",
      sexual_content: "Sexual content",
      spam_scam: "Spam or scam",
      copyright: "Copyright issue",
      privacy: "Privacy concern",
      not_aligned: "Not aligned with HTBF community",
      bug: "Bug / technical issue",
      other: "Other",
    };

    return labels[reason] || reason.replace("_", " ");
  }

  function statusStyle(status: string | null) {
    if (status === "approved") return "bg-green-50 text-green-700";
    if (status === "rejected") return "bg-red-50 text-red-700";
    if (status === "needs_review") return "bg-blue-50 text-blue-700";
    if (status === "removed") return "bg-slate-100 text-slate-700";
    if (status === "submitted") return "bg-amber-50 text-amber-700";
    if (status === "reviewing") return "bg-blue-50 text-blue-700";
    if (status === "completed") return "bg-green-50 text-green-700";

    return "bg-amber-50 text-amber-700";
  }

  function reportStatusStyle(status: string | null) {
    if (status === "open") return "bg-red-50 text-red-700";
    if (status === "reviewing") return "bg-blue-50 text-blue-700";
    if (status === "dismissed") return "bg-slate-100 text-slate-700";
    if (status === "action_taken") return "bg-green-50 text-green-700";

    return "bg-amber-50 text-amber-700";
  }

  function isPendingStatus(status: string | null) {
    return !status || status === "pending" || status === "submitted" || status === "needs_review";
  }

  function storyHasVideo(story: Story) {
    return Boolean(story.video_url);
  }

  function storyHasPhoto(story: Story) {
    return Boolean(story.image_url || story.thumbnail_url);
  }

  function storyMatchesFilter(story: Story, filter: StoryFilter) {
    const storyType = story.story_type?.toLowerCase() ?? "";

    if (filter === "all") return true;
    if (filter === "pending") return isPendingStatus(story.status);
    if (filter === "approved") return story.status === "approved";
    if (filter === "removed") return story.status === "removed";
    if (filter === "videos") return storyHasVideo(story);
    if (filter === "photos") return storyHasPhoto(story);
    if (filter === "prayer") return storyType.includes("prayer");
    if (filter === "testimonies") return storyType.includes("testimony");
    if (filter === "praise") return storyType.includes("praise");

    return true;
  }

  function storyMatchesSearch(story: Story, search: string) {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return true;

    return [
      story.name,
      story.email,
      story.location,
      story.story_type,
      story.story_text,
      story.id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  }

  const openReports = useMemo(
    () =>
      reports.filter(
        (report) => report.status === "open" || report.status === "reviewing"
      ),
    [reports]
  );

  const activeDeletionRequests = useMemo(
    () =>
      deletionRequests.filter(
        (request) =>
          request.status === "submitted" || request.status === "reviewing"
      ),
    [deletionRequests]
  );

  const attentionPrayerVideoResponses = useMemo(() => {
    const reportedResponseIds = new Set(
      openReports
        .map((report) => report.prayer_video_response_id)
        .filter((id): id is string => Boolean(id))
    );

    return prayerVideoResponses.filter((response) =>
      responseNeedsAdminAttention(response, {
        responseId: response.response_id,
        reportedResponseIds,
      })
    );
  }, [openReports, prayerVideoResponses]);

  const pendingPrayerVideoResponses = attentionPrayerVideoResponses;

  const aiReviewNeededCount = useMemo(
    () =>
      stories.filter((story) => {
        const hasFlags = Array.isArray(story.ai_flags) && story.ai_flags.length > 0;

        return (
          story.ai_suggested_action === "review" ||
          story.ai_suggested_action === "reject" ||
          story.ai_risk_level === "medium" ||
          story.ai_risk_level === "high" ||
          story.ai_review_status === "failed" ||
          hasFlags
        );
      }).length,
    [stories]
  );

  const reportCountsByStory = useMemo(() => {
    const counts = new Map<string, number>();

    reports.forEach((report) => {
      if (!report.story_id) return;

      counts.set(report.story_id, (counts.get(report.story_id) ?? 0) + 1);
    });

    return counts;
  }, [reports]);

  const adminStats = useMemo(
    () => ({
      pendingReview: stories.filter((story) => isPendingStatus(story.status)).length,
      approved: stories.filter((story) => story.status === "approved").length,
      removed: stories.filter((story) => story.status === "removed").length,
      videos: stories.filter(storyHasVideo).length,
      prayerRequests: stories.filter((story) =>
        story.story_type?.toLowerCase().includes("prayer")
      ).length,
      aiReviewNeeded: aiReviewNeededCount,
    }),
    [aiReviewNeededCount, stories]
  );

  const filteredStories = useMemo(
    () =>
      stories.filter(
        (story) =>
          storyMatchesFilter(story, activeFilter) &&
          storyMatchesSearch(story, searchTerm)
      ),
    [activeFilter, searchTerm, stories]
  );

  const visiblePendingStories = useMemo(
    () => filteredStories.filter((story) => isPendingStatus(story.status)),
    [filteredStories]
  );

  function getStoryReportCount(storyId: string) {
    return reportCountsByStory.get(storyId) ?? 0;
  }

  function scrollToAdminSection(sectionId: string) {
    window.requestAnimationFrame(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function reviewVideos() {
    setActiveFilter("videos");
    scrollToAdminSection("content-review");
  }

  async function copyStoryId(storyId: string) {
    try {
      await navigator.clipboard.writeText(storyId);
      setMessage("Story ID copied.");
    } catch {
      setMessage("Could not copy story ID.");
    }
  }

  async function approveAllVisiblePending() {
    if (visiblePendingStories.length === 0) return;

    const confirmed = window.confirm(
      `Approve ${visiblePendingStories.length} visible pending item${
        visiblePendingStories.length === 1 ? "" : "s"
      }? This will make them live on HTBF.`
    );

    if (!confirmed) return;

    for (const story of visiblePendingStories) {
      await updateStoryStatus(story.id, "approved");
    }

    setMessage(
      `${visiblePendingStories.length} visible pending item${
        visiblePendingStories.length === 1 ? "" : "s"
      } approved.`
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading admin review page...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] shadow-sm ring-1 ring-blue-100 hover:bg-blue-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8 md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-blue-100 ring-1 ring-white/15">
            <ShieldCheck className="h-4 w-4" />
            ADMIN CONTROL CENTER
          </div>

          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-5xl">
            Review and manage HTBF content
          </h1>

          <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-blue-100">
            Approve stories, videos, prayer requests, reports, and account
            requests from one place.
          </p>

          <p className="mt-5 text-sm font-bold text-blue-100">
            Signed in as <span className="text-white">{email}</span>
          </p>
        </header>

        {message && (
          <div className="mt-5 rounded-[1.5rem] bg-white p-4 text-sm font-bold leading-6 text-[#082f63] shadow-sm ring-1 ring-blue-100">
            {message}
          </div>
        )}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <AdminStatCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="Pending Review"
            value={adminStats.pendingReview}
          />
          <AdminStatCard
            icon={<CheckCircle className="h-5 w-5" />}
            label="Approved"
            value={adminStats.approved}
          />
          <AdminStatCard
            icon={<EyeOff className="h-5 w-5" />}
            label="Removed"
            value={adminStats.removed}
          />
          <AdminStatCard
            icon={<Video className="h-5 w-5" />}
            label="Videos"
            value={adminStats.videos}
          />
          <AdminStatCard
            icon={<FileText className="h-5 w-5" />}
            label="Prayer Requests"
            value={adminStats.prayerRequests}
          />
          <AdminStatCard
            icon={<Flag className="h-5 w-5" />}
            label="Open Reports"
            value={openReports.length}
            href="#reports"
            tone={openReports.length > 0 ? "danger" : "default"}
          />
          <AdminStatCard
            icon={<Lock className="h-5 w-5" />}
            label="Blocked Users"
            value={blockedUsersCount}
          />
          <AdminStatCard
            icon={<ShieldAlert className="h-5 w-5" />}
            label="AI Review Needed"
            value={adminStats.aiReviewNeeded}
            href="#content-review"
            tone={adminStats.aiReviewNeeded > 0 ? "warning" : "default"}
          />
        </section>

        <section className="mt-5 rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Quick Actions
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Jump directly to the next moderation task.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <AdminQuickAction
                label="Review Reports"
                count={openReports.length}
                href="#reports"
                urgent={openReports.length > 0}
              />
              <AdminQuickAction
                label="Review Videos"
                count={adminStats.videos}
                onClick={reviewVideos}
              />
              <AdminQuickAction
                label="Review Prayer Responses"
                count={pendingPrayerVideoResponses.length}
                href="#prayer-video-responses"
              />
              <AdminQuickAction
                label="Account Requests"
                count={activeDeletionRequests.length}
                href="#account-requests"
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminNavCard
            title="Content Review"
            description={`${adminStats.pendingReview} item${
              adminStats.pendingReview === 1 ? "" : "s"
            } waiting`}
            onClick={() => {
              setActiveFilter("pending");
              scrollToAdminSection("content-review");
            }}
          />
          <AdminNavCard
            title="Removed Content"
            description={`${adminStats.removed} removed`}
            onClick={() => {
              setActiveFilter("removed");
              scrollToAdminSection("content-review");
            }}
          />
          <AdminNavCard
            title="Approved Content"
            description={`${adminStats.approved} live`}
            onClick={() => {
              setActiveFilter("approved");
              scrollToAdminSection("content-review");
            }}
          />
          <AdminNavCard
            title="All Content"
            description={`${stories.length} total submissions`}
            onClick={() => {
              setActiveFilter("all");
              scrollToAdminSection("content-review");
            }}
          />
        </section>

        <section
          id="content-review"
          className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Content Review
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Review queue
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Search, filter, approve, reject, remove, or open media from one
                focused queue.
              </p>
            </div>

            {visiblePendingStories.length > 0 && (
              <button
                type="button"
                onClick={approveAllVisiblePending}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                Approve All Visible Pending
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label className="block">
              <span className="sr-only">Search content</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, story text, type, or location..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <div className="text-sm font-bold text-slate-500">
              Showing {filteredStories.length} of {stories.length}
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {storyFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
                  activeFilter === filter.value
                    ? "bg-[#0b63ce] text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4">
            {filteredStories.length === 0 ? (
              <div className="rounded-[1.5rem] bg-slate-50 p-6 text-center text-sm font-bold text-slate-600">
                No content matches this view.
              </div>
            ) : (
              filteredStories.map((story) => {
                const reportCount = getStoryReportCount(story.id);
                const isExpanded = expandedStoryId === story.id;
                const mediaPreview =
                  story.thumbnail_url || storyImageUrls[story.id] || null;
                const previewText =
                  story.story_text || "No story text available.";

                return (
                  <article
                    id={`story-${story.id}`}
                    key={story.id}
                    className="rounded-[2rem] bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5"
                  >
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                            {story.story_type || "Story"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                              story.status
                            )}`}
                          >
                            {statusLabel(story.status)}
                          </span>
                          {storyHasVideo(story) && (
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
                              Video
                            </span>
                          )}
                          {storyHasPhoto(story) && (
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-sky-700">
                              Photo
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 text-2xl font-black text-[#062a57]">
                          {story.name || "Name not provided"}
                        </h3>

                        <div className="mt-2 grid gap-1 text-sm font-semibold text-slate-500 sm:grid-cols-2">
                          <div>Email: {story.email || "Not provided"}</div>
                          <div>Location: {story.location || "Not provided"}</div>
                          <div>Submitted {formatDate(story.created_at)}</div>
                          <div>
                            Reports:{" "}
                            <span className="font-black text-slate-700">
                              {reportCount}
                            </span>
                          </div>
                        </div>

                        <p
                          className={`mt-4 whitespace-pre-wrap rounded-[1.25rem] bg-white p-4 text-sm leading-7 text-slate-700 ring-1 ring-slate-100 ${
                            isExpanded ? "" : "line-clamp-4"
                          }`}
                          style={{
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {previewText}
                        </p>

                        {isExpanded && (
                          <div className="mt-3 rounded-2xl bg-white p-4 text-xs font-bold text-slate-500 ring-1 ring-slate-100">
                            Story ID: {story.id}
                          </div>
                        )}
                      </div>

                      <div className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-slate-200">
                        {mediaPreview ? (
                          <img
                            src={mediaPreview}
                            alt={story.story_type || "Story preview"}
                            className="h-48 w-full object-cover"
                          />
                        ) : story.video_url ? (
                          <div className="flex h-48 items-center justify-center bg-slate-950 text-white/80">
                            <div className="text-center text-sm font-bold">
                              <Video className="mx-auto mb-2 h-8 w-8" />
                              Video testimony
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-48 items-center justify-center bg-blue-50 text-[#0b63ce]">
                            <div className="text-center text-sm font-black">
                              <FileText className="mx-auto mb-2 h-8 w-8" />
                              Text post
                            </div>
                          </div>
                        )}

                        {story.video_url && (
                          <button
                            type="button"
                            onClick={() => openVideoReviewPage(story.id)}
                            className="flex w-full items-center justify-center gap-2 bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                          >
                            <Video className="h-4 w-4" />
                            Open Video Review
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => updateStoryStatus(story.id, "approved")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>

                      <button
                        type="button"
                        onClick={() => updateStoryStatus(story.id, "rejected")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>

                      <button
                        type="button"
                        onClick={() => updateStoryStatus(story.id, "removed")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                      >
                        <EyeOff className="h-4 w-4" />
                        Remove
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedStoryId(isExpanded ? null : story.id)
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-50 px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
                      >
                        <UserCircle className="h-4 w-4" />
                        {isExpanded ? "Hide Details" : "View"}
                      </button>

                      <button
                        type="button"
                        onClick={() => copyStoryId(story.id)}
                        className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                      >
                        Copy ID
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {storiesHasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMoreStories()}
                disabled={loadingMoreStories}
                className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-60"
              >
                {loadingMoreStories ? "Loading more stories..." : "Load more stories"}
              </button>
            </div>
          ) : null}
        </section>

        <section
          id="prayer-video-responses"
          className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Public Video Responses
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Feed, prayer, and video response review
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review public video responses separately from stories and
                private Journey Inbox prayer videos.
              </p>
            </div>

            <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-700 ring-1 ring-amber-100">
              {pendingPrayerVideoResponses.length} waiting
            </div>
          </div>

          {prayerVideoResponses.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5 text-slate-600">
              No public video responses yet.
            </div>
          ) : attentionPrayerVideoResponses.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5 text-slate-600">
              No public video responses need admin attention right now. Auto-approved
              responses are live without appearing in this queue.
            </div>
          ) : (
            <div className="grid gap-4">
              {attentionPrayerVideoResponses.map((response) => {
                const videoPreviewUrl =
                  prayerResponseVideoUrls[response.response_id] ?? null;
                const responseAuthor =
                  response.response_author_display_name ||
                  response.response_author_username ||
                  "HTBF community member";
                const parentOwner =
                  response.parent_owner_display_name ||
                  response.prayer_owner_display_name ||
                  response.prayer_owner_name ||
                  response.parent_owner_username ||
                  response.prayer_owner_username ||
                  "Parent owner";
                const responseContext =
                  response.response_context ??
                  resolveResponseContextFromStory({
                    story_type: response.parent_story_type ?? null,
                  });
                const responseTypeLabel = adminResponseTypeLabel(responseContext);
                const parentContentLabel = adminParentContentLabel(responseContext);
                const parentOwnerLabel = adminParentOwnerLabel(responseContext);
                const isModerating =
                  moderatingResponseId === response.response_id;
                const aiReview = presentVideoResponseAiReview(response);
                const parentContentText = resolveAdminParentContentText(response);
                const canApprove =
                  response.status !== "approved" &&
                  response.status !== "removed" &&
                  !response.removed_at;

                return (
                  <article
                    key={response.response_id}
                    className="rounded-[1.75rem] bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5"
                  >
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                            Public {responseTypeLabel}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                              response.status
                            )}`}
                          >
                            {statusLabel(response.status)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                              Response Author
                            </div>
                            <div className="mt-1 break-words font-black text-[#062a57]">
                              {responseAuthor}
                            </div>
                            {response.response_author_username && (
                              <div className="mt-1 break-words text-sm font-bold text-slate-500">
                                @{response.response_author_username}
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                              {parentOwnerLabel}
                            </div>
                            <div className="mt-1 break-words font-black text-[#062a57]">
                              {parentOwner}
                            </div>
                            <div className="mt-1 text-sm font-bold text-slate-500">
                              Submitted {formatDate(response.created_at)}
                            </div>
                            <div className="mt-1 break-all text-xs font-semibold text-slate-400">
                              Parent story ID: {response.story_id}
                            </div>
                            {response.parent_story_type ? (
                              <div className="mt-1 text-xs font-semibold text-slate-400">
                                Parent type: {response.parent_story_type}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                            {parentContentLabel}
                          </div>
                          <p
                            className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {parentContentText}
                          </p>
                        </div>

                        <div className="mt-4 rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-100">
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">
                            AI Review
                          </div>
                          <div className="mt-2 text-sm font-bold text-violet-950">
                            {aiReview.headline}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-violet-900">
                            {aiReview.detail}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-violet-800">
                            {aiReview.scopeLine}
                          </p>
                          {aiReview.flags.length > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-violet-800">
                              Flags: {aiReview.flags.join(", ")}
                            </p>
                          ) : null}
                        </div>

                        {response.body && (
                          <div className="mt-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                              Response Text
                            </div>
                            <p
                              className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#082f63]"
                              style={{
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                              }}
                            >
                              {response.body}
                            </p>
                          </div>
                        )}

                        <div className="mt-4 text-xs font-bold text-slate-400">
                          Response ID: {response.response_id}
                        </div>

                        {moderatorDurationNotice(
                          response.duration_verification_status
                        ) ? (
                          <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900 ring-1 ring-amber-200">
                            {moderatorDurationNotice(
                              response.duration_verification_status
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="overflow-hidden rounded-[1.5rem] bg-slate-950 ring-1 ring-slate-800">
                        {videoPreviewUrl ? (
                          <video
                            src={videoPreviewUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-h-[520px] w-full bg-black object-contain"
                          />
                        ) : (
                          <div className="flex min-h-64 items-center justify-center p-6 text-center text-sm font-bold text-white/70">
                            <div>
                              <Video className="mx-auto mb-2 h-8 w-8" />
                              Video preview unavailable
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {response.status === "approved" ? (
                        <>
                          <div className="inline-flex items-center justify-center gap-2 rounded-full bg-green-50 px-5 py-3 text-sm font-black text-green-700 ring-1 ring-green-200">
                            <CheckCircle className="h-4 w-4" />
                            Approved ✓
                          </div>
                          <button
                            type="button"
                            disabled={isModerating}
                            onClick={() =>
                              void moderatePrayerVideoResponse(
                                response.response_id,
                                "rejected"
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
                          >
                            <XCircle className="h-4 w-4" />
                            {isModerating ? "Working…" : "Revoke / Reject"}
                          </button>
                        </>
                      ) : response.status === "removed" ? (
                        <div className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200">
                          <EyeOff className="h-4 w-4" />
                          Removed
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isModerating || !canApprove}
                            onClick={() =>
                              void moderatePrayerVideoResponse(
                                response.response_id,
                                "approved"
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {isModerating ? "Approving…" : "Approve"}
                          </button>

                          <button
                            type="button"
                            disabled={isModerating || response.status === "rejected"}
                            onClick={() =>
                              void moderatePrayerVideoResponse(
                                response.response_id,
                                "rejected"
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            {isModerating ? "Working…" : "Reject"}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        disabled={isModerating || response.status === "removed"}
                        onClick={() =>
                          void moderatePrayerVideoResponse(
                            response.response_id,
                            "removed"
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <EyeOff className="h-4 w-4" />
                        {isModerating ? "Working…" : "Remove"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          id="reports"
          className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Reports
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Reported content
              </h2>
            </div>

            <div className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100">
              {openReports.length} open
            </div>
          </div>

          {openReports.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5 text-slate-600">
              No open reports.
            </div>
          ) : (
            <div className="grid gap-4">
              {openReports.map((report) => {
                const linkedPrayerResponse = report.prayer_video_response_id
                  ? prayerVideoResponses.find(
                      (response) =>
                        response.response_id ===
                        report.prayer_video_response_id
                    ) ?? null
                  : null;
                const linkedPrayerVideoUrl = report.prayer_video_response_id
                  ? prayerResponseVideoUrls[
                      report.prayer_video_response_id
                    ] ?? null
                  : null;

                return (
                  <article
                    key={report.id}
                    className="rounded-[1.75rem] bg-red-50/60 p-5 ring-1 ring-red-100"
                  >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-red-700">
                          {reasonLabel(report.reason)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${reportStatusStyle(
                            report.status
                          )}`}
                        >
                          {statusLabel(report.status)}
                        </span>
                        {report.prayer_video_response_id && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce] ring-1 ring-blue-100">
                            Prayer Video Response
                          </span>
                        )}
                        {report.story?.status && (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                              report.story.status
                            )}`}
                          >
                            Story: {statusLabel(report.story.status)}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-4 text-2xl font-black text-[#062a57]">
                        {report.prayer_video_response_id
                          ? "Reported public prayer response"
                          : report.story?.name || "Reported content"}
                      </h3>

                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        <div>Reported {formatDate(report.created_at)}</div>
                        <div>Reporter ID: {report.reporter_user_id || "Unavailable"}</div>
                        <div>Posted by: {report.reported_user_id || "Unavailable"}</div>
                        {report.prayer_video_response_id && (
                          <div>
                            Prayer Response ID: {report.prayer_video_response_id}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-black text-red-700">
                      <Flag className="h-4 w-4" />
                      User report
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl bg-white p-5">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Report details
                      </div>
                      <p className="mt-2 leading-7 text-slate-700">
                        {report.details || "No additional details provided."}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-5">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        {report.prayer_video_response_id
                          ? "Parent prayer"
                          : "Reported story"}
                      </div>
                      <p className="mt-2 line-clamp-4 whitespace-pre-line leading-7 text-slate-700">
                        {report.story?.story_text || "No story text available."}
                      </p>
                      {report.story?.video_url && (
                        <button
                          type="button"
                          onClick={() => openVideoReviewPage(report.story?.id)}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
                        >
                          <Video className="h-4 w-4" />
                          Open Video
                        </button>
                      )}
                    </div>
                  </div>

                  {report.prayer_video_response_id && (
                    <div className="mt-4 grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-blue-100 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                          Reported Public Response
                        </div>
                        <div className="mt-2 font-black text-[#062a57]">
                          {linkedPrayerResponse?.response_author_display_name ||
                            linkedPrayerResponse?.response_author_username ||
                            "HTBF community member"}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-500">
                          Status: {statusLabel(linkedPrayerResponse?.status ?? null)}
                        </div>
                        {linkedPrayerResponse?.body && (
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                            {linkedPrayerResponse.body}
                          </p>
                        )}
                      </div>

                      <div className="overflow-hidden rounded-[1.25rem] bg-slate-950">
                        {linkedPrayerVideoUrl ? (
                          <video
                            src={linkedPrayerVideoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-h-[420px] w-full bg-black object-contain"
                          />
                        ) : (
                          <div className="flex min-h-48 items-center justify-center p-5 text-center text-sm font-bold text-white/70">
                            Video preview unavailable
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {report.admin_notes && (
                    <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-700">
                      Admin notes: {report.admin_notes}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => markReportReviewing(report.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Mark Reviewing
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissReport(report.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Dismiss Report
                    </button>
                    <button
                      type="button"
                      onClick={() => removeReportedContent(report)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
                    >
                      <EyeOff className="h-4 w-4" />
                      {report.prayer_video_response_id
                        ? "Remove Prayer Response"
                        : "Remove Content"}
                    </button>
                  </div>
                  </article>
                );
              })}
            </div>
          )}

          {reportsHasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMoreReports()}
                disabled={loadingMoreReports}
                className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-[#0b63ce] ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-60"
              >
                {loadingMoreReports ? "Loading more reports..." : "Load more reports"}
              </button>
            </div>
          ) : null}
        </section>

        <section
          id="account-requests"
          className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Account Requests
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Account deletion requests
              </h2>
            </div>

            <div className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700 ring-1 ring-orange-100">
              {activeDeletionRequests.length} active
            </div>
          </div>

          {deletionRequests.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5 text-slate-600">
              No account deletion requests yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {deletionRequests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-[1.75rem] bg-orange-50/70 p-5 ring-1 ring-orange-100"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-orange-700">
                          Account Deletion
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                            request.status
                          )}`}
                        >
                          {statusLabel(request.status)}
                        </span>
                      </div>

                      <h3 className="mt-4 text-2xl font-black text-[#062a57]">
                        {request.email || "Email unavailable"}
                      </h3>

                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        <div>Requested {formatDate(request.created_at)}</div>
                        <div>User ID: {request.user_id}</div>
                        {request.reviewed_at && (
                          <div>Reviewed {formatDate(request.reviewed_at)}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-black text-orange-700">
                      <ShieldAlert className="h-4 w-4" />
                      User request
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-5">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      User reason
                    </div>
                    <p className="mt-2 leading-7 text-slate-700">
                      {request.reason || "No reason provided."}
                    </p>
                  </div>

                  {request.admin_notes && (
                    <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-700">
                      Admin notes: {request.admin_notes}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => markDeletionReviewing(request.id)}
                      disabled={request.status === "completed"}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Mark Reviewing
                    </button>
                    <button
                      type="button"
                      onClick={() => completeDeletionRequest(request.id)}
                      disabled={request.status === "completed"}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Completed
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function toPrayerVideoResponse(value: unknown): PrayerVideoResponse | null {
  if (typeof value !== "object" || value === null) return null;

  const response = value as Record<string, unknown>;
  const responseId =
    readRequiredString(response.response_id) ??
    readRequiredString(response.id);
  const storyId = readRequiredString(response.story_id);
  const responseUserId =
    readRequiredString(response.response_user_id) ??
    readRequiredString(response.user_id);
  const videoUrl = readRequiredString(response.video_url);
  const status = readRequiredString(response.status);

  if (!responseId || !storyId || !responseUserId || !videoUrl || !status) {
    return null;
  }

  return {
    response_id: responseId,
    story_id: storyId,
    response_user_id: responseUserId,
    video_url: videoUrl,
    body: readNullableString(response.body),
    status,
    created_at: readNullableString(response.created_at),
    moderated_at: readNullableString(response.moderated_at),
    moderated_by: readNullableString(response.moderated_by),
    hidden_at: readNullableString(response.hidden_at),
    removed_at: readNullableString(response.removed_at),
    prayer_text: readNullableString(response.prayer_text),
    prayer_owner_user_id: readNullableString(response.prayer_owner_user_id),
    prayer_owner_name: readNullableString(response.prayer_owner_name),
    prayer_owner_display_name: readNullableString(
      response.prayer_owner_display_name
    ),
    prayer_owner_username: readNullableString(response.prayer_owner_username),
    prayer_owner_avatar_url: readNullableString(
      response.prayer_owner_avatar_url
    ),
    response_author_display_name: readNullableString(
      response.response_author_display_name
    ),
    response_author_username: readNullableString(
      response.response_author_username
    ),
    response_author_avatar_url: readNullableString(
      response.response_author_avatar_url
    ),
  };
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function AdminStatCard({
  icon,
  label,
  value,
  href,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  href?: string;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClasses = {
    default: {
      card: "bg-white ring-slate-200",
      icon: "bg-blue-50 text-[#0b63ce]",
      value: "text-[#062a57]",
      label: "text-slate-500",
    },
    danger: {
      card: "bg-red-50 ring-red-200",
      icon: "bg-red-100 text-red-700",
      value: "text-red-700",
      label: "text-red-700",
    },
    warning: {
      card: "bg-amber-50 ring-amber-200",
      icon: "bg-amber-100 text-amber-700",
      value: "text-amber-800",
      label: "text-amber-700",
    },
  }[tone];
  const className = `block rounded-[1.5rem] p-4 text-left shadow-sm ring-1 transition ${toneClasses.card} ${
    href ? "hover:-translate-y-0.5 hover:shadow-md" : ""
  }`;
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClasses.icon}`}
        >
          {icon}
        </div>
        <div className={`text-3xl font-black ${toneClasses.value}`}>{value}</div>
      </div>
      <div
        className={`mt-3 text-xs font-black uppercase tracking-[0.14em] ${toneClasses.label}`}
      >
        {label}
      </div>
    </>
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

function AdminQuickAction({
  label,
  count,
  href,
  onClick,
  urgent = false,
}: {
  label: string;
  count: number;
  href?: string;
  onClick?: () => void;
  urgent?: boolean;
}) {
  const className = `inline-flex min-h-11 items-center justify-between gap-3 rounded-full px-4 py-2 text-sm font-black transition ${
    urgent
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
  }`;
  const content = (
    <>
      <span>{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          urgent ? "bg-white/20 text-white" : "bg-white text-[#062a57]"
        }`}
      >
        {count}
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function AdminNavCard({
  title,
  description,
  href,
  onClick,
}: {
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "block rounded-[1.5rem] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 hover:ring-blue-100";
  const content = (
    <>
      <div className="text-sm font-black text-[#062a57]">{title}</div>
      <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
        {description}
      </div>
    </>
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

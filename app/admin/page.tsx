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
import { supabase } from "../../lib/supabaseClient";

const ADMIN_EMAIL = "hypertobefree@gmail.com";

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
  prayer_text: string | null;
  prayer_owner_user_id: string | null;
  prayer_owner_name: string | null;
  prayer_owner_display_name: string | null;
  prayer_owner_username: string | null;
  prayer_owner_avatar_url: string | null;
  response_author_display_name: string | null;
  response_author_username: string | null;
  response_author_avatar_url: string | null;
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
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [message, setMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<StoryFilter>("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);

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

    if (user.email !== ADMIN_EMAIL) {
      setNotAllowed(true);
      setLoading(false);
      return;
    }

    await Promise.all([
      loadStories(),
      loadReports(),
      loadDeletionRequests(),
      loadPrayerVideoResponses(),
    ]);

    setLoading(false);
  }

  async function loadStories() {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, image_url, video_url, thumbnail_url, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load stories: ${error.message}`);
      return;
    }

    const loadedStories = (data as Story[]) ?? [];

    setStories(loadedStories);
    void loadStoryImageUrls(loadedStories);
  }

  async function loadPrayerVideoResponses() {
    const { data, error } = await supabase.rpc(
      "list_prayer_video_responses_for_admin"
    );

    if (error) {
      setMessage(`Could not load prayer video responses: ${error.message}`);
      return;
    }

    const rawResponses: unknown[] = Array.isArray(data) ? data : [];
    const loadedResponses = rawResponses
      .map(toPrayerVideoResponse)
      .filter(
        (response): response is PrayerVideoResponse => response !== null
      );

    setPrayerVideoResponses(loadedResponses);
    await loadPrayerResponseVideoUrls(loadedResponses);
  }

  async function loadReports() {
    const { data, error } = await supabase
      .from("content_reports")
      .select(
        "id, story_id, reporter_user_id, reported_user_id, reason, details, status, admin_notes, created_at, reviewed_at, reviewed_by"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load reports: ${error.message}`);
      return;
    }

    const baseReports = (data as ContentReport[]) ?? [];

    const storyIds = baseReports
      .map((report) => report.story_id)
      .filter((id): id is string => Boolean(id));

    if (storyIds.length === 0) {
      setReports(baseReports);
      return;
    }

    const { data: storyData, error: storyError } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, image_url, video_url, thumbnail_url, status, created_at"
      )
      .in("id", storyIds);

    if (storyError) {
      setMessage(`Could not load reported stories: ${storyError.message}`);
      setReports(baseReports);
      return;
    }

    const storyMap = new Map(
      ((storyData as Story[]) ?? []).map((story) => [story.id, story])
    );

    const reportsWithStories = baseReports.map((report) => ({
      ...report,
      story: report.story_id ? storyMap.get(report.story_id) ?? null : null,
    }));

    setReports(reportsWithStories);
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

  async function createApprovalInboxMessage(story: Story | null | undefined) {
    if (!story?.user_id) return;

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
    nextStatus: PrayerVideoResponseStatus
  ) {
    if (
      nextStatus === "removed" &&
      !window.confirm("Remove this public prayer video response?")
    ) {
      return;
    }

    setMessage("");

    const { error } = await supabase.rpc(
      "moderate_prayer_video_response",
      {
        response_id: responseId,
        next_status: nextStatus,
      }
    );

    if (error) {
      setMessage(
        `Could not moderate prayer video response: ${error.message}`
      );
      return;
    }

    const moderatedAt = new Date().toISOString();

    setPrayerVideoResponses((currentResponses) =>
      currentResponses.map((response) =>
        response.response_id === responseId
          ? {
              ...response,
              status: nextStatus,
              moderated_at: moderatedAt,
              removed_at:
                nextStatus === "removed" ? moderatedAt : null,
            }
          : response
      )
    );
    setMessage(
      `Prayer video response marked as ${nextStatus.replace("_", " ")}.`
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

  const pendingPrayerVideoResponses = useMemo(
    () =>
      prayerVideoResponses.filter((response) =>
        isPendingStatus(response.status)
      ),
    [prayerVideoResponses]
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
      reportsAndRequests: openReports.length + activeDeletionRequests.length,
    }),
    [activeDeletionRequests.length, openReports.length, stories]
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

  if (notAllowed) {
    return (
      <main className="min-h-screen bg-[#f8fbff] text-slate-900">
        <section className="mx-auto max-w-3xl px-6 py-12">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Lock className="h-6 w-6" />
            </div>

            <h1 className="text-3xl font-black text-[#062a57]">
              Admin access only
            </h1>

            <p className="mt-4 leading-7 text-slate-600">
              You are signed in as{" "}
              <span className="font-bold text-[#0b63ce]">{email}</span>, but
              this page is only available to the Hyper to Be Free admin account.
            </p>
          </div>
        </section>
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

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            label="Reports / Requests"
            value={adminStats.reportsAndRequests}
          />
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <AdminNavCard
            title="Content Review"
            description={`${adminStats.pendingReview} item${
              adminStats.pendingReview === 1 ? "" : "s"
            } waiting`}
            onClick={() => setActiveFilter("pending")}
          />
          <AdminNavCard
            title="Video Review"
            description={`${adminStats.videos} video item${
              adminStats.videos === 1 ? "" : "s"
            }`}
            onClick={() => setActiveFilter("videos")}
          />
          <AdminNavCard
            title="Prayer Video Responses"
            description={`${pendingPrayerVideoResponses.length} waiting`}
            href="#prayer-video-responses"
          />
          <AdminNavCard
            title="Reports"
            description={`${openReports.length} open`}
            href="#reports"
          />
          <AdminNavCard
            title="Account Requests"
            description={`${activeDeletionRequests.length} active`}
            href="#account-requests"
          />
          <AdminNavCard
            title="Removed Content"
            description={`${adminStats.removed} removed`}
            onClick={() => setActiveFilter("removed")}
          />
          <AdminNavCard
            title="Approved Content"
            description={`${adminStats.approved} live`}
            onClick={() => setActiveFilter("approved")}
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
        </section>

        <section
          id="prayer-video-responses"
          className="mt-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
                Prayer Video Responses
              </div>
              <h2 className="mt-1 text-3xl font-black text-[#062a57]">
                Public response review
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
              No public prayer video responses yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {prayerVideoResponses.map((response) => {
                const videoPreviewUrl =
                  prayerResponseVideoUrls[response.response_id] ?? null;
                const responseAuthor =
                  response.response_author_display_name ||
                  response.response_author_username ||
                  "HTBF community member";
                const prayerOwner =
                  response.prayer_owner_display_name ||
                  response.prayer_owner_name ||
                  response.prayer_owner_username ||
                  "Prayer owner";

                return (
                  <article
                    key={response.response_id}
                    className="rounded-[1.75rem] bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5"
                  >
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                            Public Prayer Response
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
                              Prayer Owner
                            </div>
                            <div className="mt-1 break-words font-black text-[#062a57]">
                              {prayerOwner}
                            </div>
                            <div className="mt-1 text-sm font-bold text-slate-500">
                              Submitted {formatDate(response.created_at)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                            Parent Prayer
                          </div>
                          <p
                            className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {response.prayer_text ||
                              "Prayer request text unavailable."}
                          </p>
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
                      <button
                        type="button"
                        onClick={() =>
                          void moderatePrayerVideoResponse(
                            response.response_id,
                            "approved"
                          )
                        }
                        disabled={response.status === "approved"}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void moderatePrayerVideoResponse(
                            response.response_id,
                            "rejected"
                          )
                        }
                        disabled={response.status === "rejected"}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void moderatePrayerVideoResponse(
                            response.response_id,
                            "removed"
                          )
                        }
                        disabled={response.status === "removed"}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <EyeOff className="h-4 w-4" />
                        Remove
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

          {reports.length === 0 ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5 text-slate-600">
              No reports yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {reports.map((report) => (
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
                        {report.story?.name || "Reported content"}
                      </h3>

                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        <div>Reported {formatDate(report.created_at)}</div>
                        <div>Reporter ID: {report.reporter_user_id || "Unavailable"}</div>
                        <div>Posted by: {report.reported_user_id || "Unavailable"}</div>
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
                        Reported story
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
                      Remove Content
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
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
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
          {icon}
        </div>
        <div className="text-3xl font-black text-[#062a57]">{value}</div>
      </div>
      <div className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
    </div>
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

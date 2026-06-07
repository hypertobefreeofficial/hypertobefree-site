"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  EyeOff,
  FileText,
  Flag,
  Lock,
  ShieldCheck,
  UserCircle,
  Video,
  XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const ADMIN_EMAIL = "hypertobefree@gmail.com";

type Story = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  created_at: string | null;
};

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

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [message, setMessage] = useState("");

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

    await Promise.all([loadStories(), loadReports()]);

    setLoading(false);
  }

  async function loadStories() {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, email, location, story_type, story_text, video_url, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Could not load stories: ${error.message}`);
      return;
    }

    setStories((data as Story[]) ?? []);
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
        "id, user_id, name, email, location, story_type, story_text, video_url, status, created_at"
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

  async function updateStoryStatus(storyId: string, newStatus: string) {
    setMessage("");

    const { error } = await supabase
      .from("stories")
      .update({ status: newStatus })
      .eq("id", storyId);

    if (error) {
      setMessage(`Could not update story: ${error.message}`);
      return;
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
      other: "Other",
    };

    return labels[reason] || reason.replace("_", " ");
  }

  function statusStyle(status: string | null) {
    if (status === "approved") {
      return "bg-green-50 text-green-700";
    }

    if (status === "rejected") {
      return "bg-red-50 text-red-700";
    }

    if (status === "needs_review") {
      return "bg-blue-50 text-blue-700";
    }

    if (status === "removed") {
      return "bg-slate-100 text-slate-700";
    }

    if (status === "submitted") {
      return "bg-amber-50 text-amber-700";
    }

    return "bg-amber-50 text-amber-700";
  }

  function reportStatusStyle(status: string | null) {
    if (status === "open") {
      return "bg-red-50 text-red-700";
    }

    if (status === "reviewing") {
      return "bg-blue-50 text-blue-700";
    }

    if (status === "dismissed") {
      return "bg-slate-100 text-slate-700";
    }

    if (status === "action_taken") {
      return "bg-green-50 text-green-700";
    }

    return "bg-amber-50 text-amber-700";
  }

  const openReports = reports.filter(
    (report) => report.status === "open" || report.status === "reviewing"
  );

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
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8 md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <ShieldCheck className="h-4 w-4" />
            Admin Review
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-5xl">
            Review submitted stories.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Signed in as{" "}
            <span className="font-bold text-[#0b63ce]">{email}</span>
          </p>

          {message && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
              {message}
            </div>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-blue-50 p-5">
              <div className="flex items-center gap-2 font-black text-[#062a57]">
                <FileText className="h-5 w-5 text-[#0b63ce]" />
                Submissions
              </div>
              <p className="mt-2 text-slate-600">
                {stories.length} total submission
                {stories.length === 1 ? "" : "s"} found.
              </p>
            </div>

            <div className="rounded-3xl bg-red-50 p-5">
              <div className="flex items-center gap-2 font-black text-red-800">
                <Flag className="h-5 w-5 text-red-600" />
                Open Reports
              </div>
              <p className="mt-2 text-red-700">
                {openReports.length} report
                {openReports.length === 1 ? "" : "s"} need attention.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5">
              <div className="flex items-center gap-2 font-black text-[#062a57]">
                <Video className="h-5 w-5 text-slate-600" />
                Total Reports
              </div>
              <p className="mt-2 text-slate-600">
                {reports.length} total report
                {reports.length === 1 ? "" : "s"} recorded.
              </p>
            </div>
          </div>

          <section className="mt-12">
            <div className="mb-5 flex items-center gap-2">
              <Flag className="h-5 w-5 text-red-600" />
              <h2 className="text-2xl font-black text-[#062a57]">
                Reported content
              </h2>
            </div>

            {reports.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">
                No reports yet.
              </div>
            ) : (
              <div className="grid gap-5">
                {reports.map((report) => (
                  <article
                    key={report.id}
                    className="rounded-3xl border border-red-100 bg-red-50/50 p-5"
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

                        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                          <div>Reported {formatDate(report.created_at)}</div>
                          <div>
                            Reporter ID:{" "}
                            <span className="font-semibold">
                              {report.reporter_user_id || "Unavailable"}
                            </span>
                          </div>
                          <div>
                            Posted by user ID:{" "}
                            <span className="font-semibold">
                              {report.reported_user_id || "Unavailable"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-bold text-red-700">
                        <Flag className="h-4 w-4" />
                        User report
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl bg-white p-5">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Report details
                      </div>
                      <p className="mt-2 leading-7 text-slate-700">
                        {report.details || "No additional details provided."}
                      </p>
                    </div>

                    <div className="mt-4 rounded-2xl bg-white p-5">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Reported story
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                          {report.story?.story_type || "Story"}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusStyle(
                            report.story?.status || null
                          )}`}
                        >
                          {statusLabel(report.story?.status || null)}
                        </span>
                      </div>

                      <p className="mt-4 whitespace-pre-line leading-7 text-slate-700">
                        {report.story?.story_text || "No story text available."}
                      </p>

                      {report.story?.video_url && (
                        <a
                          href={report.story.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-bold text-white hover:bg-[#084f9f]"
                        >
                          <Video className="h-4 w-4" />
                          Open Video
                        </a>
                      )}
                    </div>

                    {report.admin_notes && (
                      <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-semibold leading-6 text-slate-700">
                        Admin notes: {report.admin_notes}
                      </div>
                    )}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button
                        onClick={() => markReportReviewing(report.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        <AlertCircle className="h-4 w-4" />
                        Mark Reviewing
                      </button>

                      <button
                        onClick={() => dismissReport(report.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Dismiss Report
                      </button>

                      <button
                        onClick={() => removeReportedContent(report)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
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

          <section className="mt-12">
            <div className="mb-5 flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#0b63ce]" />
              <h2 className="text-2xl font-black text-[#062a57]">
                All submitted stories
              </h2>
            </div>

            <div className="grid gap-5">
              {stories.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-slate-600">
                  No submitted stories yet.
                </div>
              ) : (
                stories.map((story) => (
                  <article
                    key={story.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
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
                        </div>

                        <h2 className="mt-4 text-2xl font-black text-[#062a57]">
                          {story.name || "Name not provided"}
                        </h2>

                        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                          <div>
                            Email:{" "}
                            <span className="font-semibold">
                              {story.email || "Not provided"}
                            </span>
                          </div>

                          <div>
                            Location:{" "}
                            <span className="font-semibold">
                              {story.location || "Not provided"}
                            </span>
                          </div>

                          <div>Submitted {formatDate(story.created_at)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                        <UserCircle className="h-4 w-4" />
                        User story
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl bg-white p-5 leading-7 text-slate-700">
                      {story.story_text || "No story text available."}
                    </div>

                    {story.video_url && (
                      <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
                        <a
                          href={story.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-bold text-white hover:bg-[#084f9f]"
                        >
                          <Video className="h-4 w-4" />
                          Open Video
                        </a>
                      </div>
                    )}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button
                        onClick={() => updateStoryStatus(story.id, "approved")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>

                      <button
                        onClick={() =>
                          updateStoryStatus(story.id, "needs_review")
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        <AlertCircle className="h-4 w-4" />
                        Needs Review
                      </button>

                      <button
                        onClick={() => updateStoryStatus(story.id, "rejected")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>

                      <button
                        onClick={() => updateStoryStatus(story.id, "removed")}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-700 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
                      >
                        <EyeOff className="h-4 w-4" />
                        Remove from Feed
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

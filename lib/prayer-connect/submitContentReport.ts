"use client";

export type ContentReportType =
  | "prayer_request"
  | "video_response"
  | "written_response"
  | "profile";

export type SubmitContentReportResult =
  | { ok: true; reportId: string | null; duplicate?: boolean }
  | { ok: false; error: string; code: string };

export async function submitContentReport(options: {
  accessToken: string;
  contentType: ContentReportType;
  reason: string;
  details?: string;
  storyId?: string | null;
  responseId?: string | null;
  reportedUserId?: string | null;
}): Promise<SubmitContentReportResult> {
  let response: Response;
  try {
    response = await fetch("/api/submit-content-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({
        content_type: options.contentType,
        reason: options.reason,
        details: options.details ?? "",
        story_id: options.storyId ?? null,
        response_id: options.responseId ?? null,
        reported_user_id: options.reportedUserId ?? null,
      }),
    });
  } catch {
    return {
      ok: false,
      error: "We couldn't reach the server. Check your connection and try again.",
      code: "network_error",
    };
  }

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; code?: string; reportId?: string | null; duplicate?: boolean }
    | null;

  if (!data || !response.ok || data.ok === false) {
    return {
      ok: false,
      error: data?.error ?? "We couldn't submit your report. Please try again.",
      code: data?.code ?? "submit_failed",
    };
  }

  return {
    ok: true,
    reportId: data.reportId ?? null,
    duplicate: data.duplicate,
  };
}

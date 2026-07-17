export type VideoResponseAdminQueueRow = {
  status: string | null;
  removed_at?: string | null;
  ai_review_status?: string | null;
  ai_risk_level?: string | null;
  ai_suggested_action?: string | null;
  ai_flags?: string[] | null;
};

export type ResponseNeedsAdminAttentionOptions = {
  reportedResponseIds?: ReadonlySet<string>;
  responseId?: string | null;
};

function isPendingStatus(status: string | null | undefined) {
  return !status || status === "pending" || status === "submitted" || status === "needs_review";
}

export function responseNeedsAdminAttention(
  response: VideoResponseAdminQueueRow,
  options: ResponseNeedsAdminAttentionOptions = {}
): boolean {
  if (response.removed_at) {
    return false;
  }

  if (
    options.responseId &&
    options.reportedResponseIds?.has(options.responseId)
  ) {
    return true;
  }

  const status = response.status;

  if (status === "approved") {
    return false;
  }

  if (status === "rejected") {
    return true;
  }

  if (isPendingStatus(status)) {
    return true;
  }

  if (
    response.ai_review_status === "failed" ||
    response.ai_review_status === "unavailable"
  ) {
    return true;
  }

  if (
    response.ai_suggested_action === "review" ||
    response.ai_suggested_action === "reject"
  ) {
    return true;
  }

  if (
    response.ai_risk_level === "medium" ||
    response.ai_risk_level === "high"
  ) {
    return true;
  }

  const hasFlags =
    Array.isArray(response.ai_flags) && response.ai_flags.length > 0;
  if (hasFlags) {
    return true;
  }

  return false;
}

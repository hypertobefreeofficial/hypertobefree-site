import type { DemoContentFieldSnapshot } from "./types";
import { buildVideoResponseModerationUpdate } from "../responses/videoResponseAiReview";

/** Load trusted persisted demo status for a profile — never accept client payloads. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTrustedProfileDemoSnapshot(
  reader: any,
  userId: string
): Promise<DemoContentFieldSnapshot | null> {
  const { data, error } = await reader
    .from("profiles")
    .select("is_demo, demo_seed_run_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function shouldSuppressBillableAiForUserId(
  reader: any,
  userId: string
): Promise<boolean> {
  try {
    const profile = await loadTrustedProfileDemoSnapshot(reader, userId);
    return shouldSuppressBillableAiCall({ actor: profile });
  } catch {
    return false;
  }
}

/** Trusted persisted demo flag — never accept client-only demo labels. */
export function isTrustedPersistedDemoRecord(
  record: DemoContentFieldSnapshot | null | undefined
): boolean {
  return record?.is_demo === true;
}

export function hasTrustedDemoSeedRun(
  record: DemoContentFieldSnapshot | null | undefined
): boolean {
  return (
    typeof record?.demo_seed_run_id === "string" &&
    record.demo_seed_run_id.trim().length > 0
  );
}

export function shouldSuppressExternalServiceForDemoRecord(
  record: DemoContentFieldSnapshot | null | undefined
): boolean {
  return isTrustedPersistedDemoRecord(record) || hasTrustedDemoSeedRun(record);
}

export function shouldSuppressInboxNotification(context: {
  story?: DemoContentFieldSnapshot | null;
  actor?: DemoContentFieldSnapshot | null;
  recipient?: DemoContentFieldSnapshot | null;
}): boolean {
  return (
    shouldSuppressExternalServiceForDemoRecord(context.story) ||
    shouldSuppressExternalServiceForDemoRecord(context.actor) ||
    shouldSuppressExternalServiceForDemoRecord(context.recipient)
  );
}

export function shouldSuppressEmailDelivery(context: {
  story?: DemoContentFieldSnapshot | null;
  actor?: DemoContentFieldSnapshot | null;
  recipient?: DemoContentFieldSnapshot | null;
}): boolean {
  return shouldSuppressInboxNotification(context);
}

export function shouldSuppressBillableAiCall(context: {
  source?: DemoContentFieldSnapshot | null;
  actor?: DemoContentFieldSnapshot | null;
}): boolean {
  return (
    shouldSuppressExternalServiceForDemoRecord(context.source) ||
    shouldSuppressExternalServiceForDemoRecord(context.actor)
  );
}

/** Deterministic moderation outcome for demo content — zero external AI cost. */
export function buildSuppressedDemoStoryModerationBody() {
  return {
    statusToUse: "submitted" as const,
    aiRiskLevel: "low" as const,
    aiSuggestedAction: "review" as const,
    aiSummary:
      "Demo content uses deterministic moderation — external AI review skipped.",
    aiFlags: ["demo_ai_suppressed"],
    aiReviewStatus: "completed" as const,
    rawFlagged: false,
    demo_ai_suppressed: true,
  };
}

/** Deterministic video-response AI metadata for demo parents/responses. */
export function buildSuppressedDemoVideoResponseAiUpdate() {
  return buildVideoResponseModerationUpdate({
    statusToUse: "submitted",
    aiRiskLevel: "low",
    aiSuggestedAction: "review",
    aiSummary:
      "Demo video response — external AI review skipped; awaiting controlled demo review.",
    aiFlags: ["demo_ai_suppressed"],
    aiReviewStatus: "completed",
  });
}

export type CommunityEmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export type CommunityEmailSendResult =
  | { ok: true; suppressed: true }
  | { ok: true; suppressed: false; provider: "resend" }
  | { ok: false; error: string };

/**
 * Gate for future Resend/community email delivery.
 * Suppressed demo attempts succeed quietly and never reach the provider.
 */
export async function sendCommunityEmailIfAllowed(
  payload: CommunityEmailPayload,
  context: {
    story?: DemoContentFieldSnapshot | null;
    actor?: DemoContentFieldSnapshot | null;
    recipient?: DemoContentFieldSnapshot | null;
  },
  sendWithProvider: (payload: CommunityEmailPayload) => Promise<void>
): Promise<CommunityEmailSendResult> {
  if (shouldSuppressEmailDelivery(context)) {
    return { ok: true, suppressed: true };
  }

  await sendWithProvider(payload);
  return { ok: true, suppressed: false, provider: "resend" };
}

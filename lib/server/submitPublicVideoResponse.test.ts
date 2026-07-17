import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifySourceForPublicVideoResponse,
  inferPublicVideoSourceType,
  submitPublicVideoResponse,
} from "./submitPublicVideoResponse";
import type { PublicModerationDecision } from "./moderatePublicContent";

const mockModeratePublicContent = vi.fn<
  [],
  Promise<PublicModerationDecision>
>();

vi.mock("./moderatePublicContent", () => ({
  moderatePublicContent: (...args: unknown[]) => mockModeratePublicContent(...args),
}));

vi.mock("./prayerBlocking", () => ({
  areUsersBlocked: vi.fn(async () => false),
}));

vi.mock("./prayerMediaValidation", () => ({
  PRAYER_MEDIA_LIMITS: { maxVideoBytes: 1, maxImageBytes: 1 },
  validateUploadedVideoObject: vi.fn(async () => ({ ok: true as const })),
  validateUploadedThumbnailObject: vi.fn(async () => ({ ok: true as const })),
}));

function autoApproveDecision(): PublicModerationDecision {
  return {
    statusToUse: "approved",
    aiReviewStatus: "completed",
    aiRiskLevel: "low",
    aiSuggestedAction: "approve",
    aiSummary: "AI moderation found no flagged content in the submitted text.",
    aiFlags: [],
  };
}

function needsReviewDecision(): PublicModerationDecision {
  return {
    statusToUse: "submitted",
    aiReviewStatus: "completed",
    aiRiskLevel: "high",
    aiSuggestedAction: "review",
    aiSummary: "AI moderation flagged this upload for admin review.",
    aiFlags: ["violence"],
  };
}

function failedModerationDecision(): PublicModerationDecision {
  return {
    statusToUse: "submitted",
    aiReviewStatus: "failed",
    aiRiskLevel: "medium",
    aiSuggestedAction: "review",
    aiSummary: "AI moderation could not complete, so this upload was sent to admin review.",
    aiFlags: ["moderation_unavailable"],
  };
}

function createMockAdminClient(options?: {
  existingDuplicate?: boolean;
  failModerationUpdate?: boolean;
}) {
  const moderationUpdates: Record<string, unknown>[] = [];
  const insertPayloads: Record<string, unknown>[] = [];
  let insertCount = 0;

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};

    if (table === "stories") {
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({
        data: {
          id: "story-1",
          user_id: "owner-1",
          story_type: "Testimony",
          story_text: "Parent caption",
          status: "approved",
          prayer_status: null,
          topics: [],
          removed_at: null,
        },
        error: null,
      }));
      return builder;
    }

    if (table === "prayer_video_responses") {
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({
        data: options?.existingDuplicate
          ? { id: "dup-1", status: "submitted", removed_at: null }
          : null,
        error: null,
      }));
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push(payload);
        return builder;
      });
      builder.single = vi.fn(async () => {
        insertCount += 1;
        return { data: { id: "response-new" }, error: null };
      });
      builder.update = vi.fn((payload: Record<string, unknown>) => {
        moderationUpdates.push(payload);
        builder.eq = vi.fn(async () => ({
          error: options?.failModerationUpdate ? { message: "update failed" } : null,
        }));
        return builder;
      });
      return builder;
    }

    return builder;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    moderationUpdates,
    insertPayloads,
    getInsertCount: () => insertCount,
  };
}

describe("inferPublicVideoSourceType", () => {
  it("classifies prayer requests as prayer", () => {
    expect(
      inferPublicVideoSourceType({ story_type: "Prayer Request" })
    ).toBe("prayer");
  });

  it("classifies ordinary feed stories as feed", () => {
    expect(inferPublicVideoSourceType({ story_type: "Testimony" })).toBe("feed");
    expect(inferPublicVideoSourceType({ story_type: "Praise Report" })).toBe(
      "feed"
    );
  });
});

describe("classifySourceForPublicVideoResponse", () => {
  const baseStory = {
    id: "story-1",
    user_id: "owner-1",
    story_type: "Testimony",
    story_text: "Fixture",
    status: "approved",
    prayer_status: null,
    topics: [],
    removed_at: null,
  };

  it("returns 404 when the source post does not exist", () => {
    const result = classifySourceForPublicVideoResponse({
      source: null,
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_not_found");
    expect(result?.status).toBe(404);
  });

  it("returns 400 when feed is requested for a prayer story", () => {
    const result = classifySourceForPublicVideoResponse({
      source: { ...baseStory, story_type: "Prayer Request" },
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_type_mismatch");
    expect(result?.status).toBe(400);
  });

  it("returns 400 when prayer is requested for a feed story", () => {
    const result = classifySourceForPublicVideoResponse({
      source: baseStory,
      sourceType: "prayer",
    });
    expect(result?.code).toBe("source_type_mismatch");
    expect(result?.status).toBe(400);
  });

  it("returns 400 when the source is not approved", () => {
    const result = classifySourceForPublicVideoResponse({
      source: { ...baseStory, status: "pending" },
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_unapproved");
    expect(result?.status).toBe(400);
  });

  it("returns 410 when the source has been removed", () => {
    const result = classifySourceForPublicVideoResponse({
      source: {
        ...baseStory,
        removed_at: "2026-07-16T00:00:00.000Z",
      },
      sourceType: "feed",
    });
    expect(result?.code).toBe("source_removed");
    expect(result?.status).toBe(410);
  });

  it("accepts approved feed stories for feed responses", () => {
    const result = classifySourceForPublicVideoResponse({
      source: baseStory,
      sourceType: "feed",
    });
    expect(result).toBeNull();
  });
});

describe("submitPublicVideoResponse moderation wiring", () => {
  beforeEach(() => {
    mockModeratePublicContent.mockReset();
  });

  it("uses the existing moderatePublicContent function for public video responses", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client } = createMockAdminClient();

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(true);
    expect(mockModeratePublicContent).toHaveBeenCalledTimes(1);
    expect(mockModeratePublicContent).toHaveBeenCalledWith(
      expect.objectContaining({
        storyType: "Testimony",
        hasVideo: true,
        storyText: expect.stringContaining("Parent caption"),
      })
    );
  });

  it("auto-approves low-risk responses by applying statusToUse to the canonical row", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client, moderationUpdates } = createMockAdminClient();

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("approved");
    expect(moderationUpdates[0]).toEqual(
      expect.objectContaining({
        status: "approved",
        ai_review_status: "completed",
        ai_risk_level: "low",
        ai_suggested_action: "approve",
        moderated_at: expect.any(String),
      })
    );
  });

  it("keeps needs-review decisions on submitted status", async () => {
    mockModeratePublicContent.mockResolvedValue(needsReviewDecision());
    const { client, moderationUpdates } = createMockAdminClient();

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("submitted");
    expect(moderationUpdates[0]?.status).toBe("submitted");
    expect(moderationUpdates[0]?.moderated_at).toBeUndefined();
  });

  it("does not publish when AI moderation fails", async () => {
    mockModeratePublicContent.mockRejectedValue(new Error("OpenAI unavailable"));
    const { client, moderationUpdates } = createMockAdminClient();

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("submitted");
    expect(moderationUpdates[0]).toEqual(
      expect.objectContaining({
        ai_review_status: "unavailable",
        ai_suggested_action: "review",
      })
    );
    expect(moderationUpdates[0]?.status).toBeUndefined();
  });

  it("does not publish when AI metadata persistence fails", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client, moderationUpdates } = createMockAdminClient({
      failModerationUpdate: true,
    });

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.status).toBe("submitted");
    expect(moderationUpdates).toHaveLength(2);
    expect(moderationUpdates[1]).toEqual(
      expect.objectContaining({
        ai_review_status: "unavailable",
      })
    );
  });

  it("reviews text and metadata only without frame, audio, or transcript analysis", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client } = createMockAdminClient();

    await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    const input = mockModeratePublicContent.mock.calls[0]?.[0] as {
      storyText: string;
      hasVideo: boolean;
    };

    expect(input.storyText).toMatch(/text and metadata only/i);
    expect(input.hasVideo).toBe(true);
    expect(JSON.stringify(input)).not.toMatch(/transcript|audio|frame/i);
  });

  it("creates exactly one canonical row and one moderation update", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client, getInsertCount, moderationUpdates } = createMockAdminClient();

    await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(getInsertCount()).toBe(1);
    expect(mockModeratePublicContent).toHaveBeenCalledTimes(1);
    expect(moderationUpdates).toHaveLength(1);
  });

  it("rejects duplicate submissions without creating another row", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client, getInsertCount } = createMockAdminClient({
      existingDuplicate: true,
    });

    const result = await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("duplicate_submission");
    expect(getInsertCount()).toBe(0);
    expect(mockModeratePublicContent).not.toHaveBeenCalled();
  });

  it("does not store public written comments on the response body", async () => {
    mockModeratePublicContent.mockResolvedValue(autoApproveDecision());
    const { client, insertPayloads } = createMockAdminClient();

    await submitPublicVideoResponse(client, {
      sourceType: "feed",
      sourcePostId: "story-1",
      responseVideoUrl: "story-videos/responder-1/response.webm",
      responderUserId: "responder-1",
    });

    expect(insertPayloads[0]?.body).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildContentReportDetails,
  buildContentReportInsertPayload,
} from "./contentReportSchema";
import { classifyContentReportInsertError } from "./classifyContentReportInsertError";

describe("contentReportSchema", () => {
  it("embeds response id in details when link column is unavailable", () => {
    expect(
      buildContentReportDetails({
        details: "test this.",
        responseId: "resp-1",
        hasResponseLinkColumn: false,
      })
    ).toBe("[response_id:resp-1] test this.");
  });

  it("builds payload only with available columns", () => {
    const columns = new Set([
      "reporter_user_id",
      "reported_user_id",
      "reason",
      "details",
      "status",
      "story_id",
    ] as const);

    const payload = buildContentReportInsertPayload({
      columns,
      reporterUserId: "reporter-1",
      reportedUserId: "author-1",
      reason: "spam_scam",
      details: "test this.",
      responseId: "resp-1",
      resolvedStoryId: "story-1",
      contentType: "video_response",
      contentSnapshot: "caption",
      mediaReference: "path/video.mp4",
    });

    expect(payload).toEqual({
      reporter_user_id: "reporter-1",
      reported_user_id: "author-1",
      reason: "spam_scam",
      details: "[response_id:resp-1] test this.",
      status: "open",
      story_id: "story-1",
    });
    expect(payload).not.toHaveProperty("prayer_video_response_id");
    expect(payload).not.toHaveProperty("content_type");
  });
});

describe("classifyContentReportInsertError", () => {
  it("classifies foreign key failures", () => {
    const result = classifyContentReportInsertError({
      code: "23503",
      message: "foreign key violation",
    });
    expect(result.code).toBe("foreign_key_failure");
    expect(result.httpStatus).toBe(422);
  });

  it("classifies missing column failures", () => {
    const result = classifyContentReportInsertError({
      code: "42703",
      message: 'column "prayer_video_response_id" does not exist',
    });
    expect(result.code).toBe("schema_missing");
    expect(result.httpStatus).toBe(503);
  });
});

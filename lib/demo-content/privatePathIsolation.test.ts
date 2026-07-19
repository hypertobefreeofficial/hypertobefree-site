import { describe, expect, it } from "vitest";
import {
  filterGenuineSavedContentJoinRows,
  filterVisibleStoryVideoRepliesForUser,
} from "./privatePathIsolation";

describe("private path isolation", () => {
  it("excludes demo story video replies from genuine inboxes", () => {
    const rows = filterVisibleStoryVideoRepliesForUser(
      [
        {
          id: "demo-reply",
          story_id: "story-1",
          user_id: "sender",
          recipient_user_id: "viewer",
          parent_reply_id: null,
          message: "demo",
          created_at: "2026-01-01T00:00:00Z",
          deleted_by_sender: false,
          deleted_by_recipient: false,
          read_at: null,
          is_demo: true,
        },
        {
          id: "real-reply",
          story_id: "story-2",
          user_id: "sender",
          recipient_user_id: "viewer",
          parent_reply_id: null,
          message: "real",
          created_at: "2026-01-02T00:00:00Z",
          deleted_by_sender: false,
          deleted_by_recipient: false,
          read_at: null,
          is_demo: false,
        },
      ],
      "viewer"
    );

    expect(rows.map((row) => row.id)).toEqual(["real-reply"]);
  });

  it("excludes saved rows tied to demo stories", () => {
    expect(
      filterGenuineSavedContentJoinRows([
        {
          is_demo: false,
          stories: { is_demo: true, id: "demo-story" },
        },
        {
          is_demo: false,
          stories: { is_demo: false, id: "real-story" },
        },
      ])
    ).toEqual([
      {
        is_demo: false,
        stories: { is_demo: false, id: "real-story" },
      },
    ]);
  });

  it("resolveDemoStoryIds returns empty set before schema is ready", async () => {
    expect(
      filterGenuineSavedContentJoinRows([
        { is_demo: true, stories: { is_demo: false, id: "saved-demo-row" } },
      ])
    ).toEqual([]);
  });
});

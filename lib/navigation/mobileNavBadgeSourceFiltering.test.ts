import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  collectParentStoryIds,
  fetchBadgeStoryVideoReplies,
  filterBadgeSourceRows,
  filterInboxRowsBySyntheticParentStories,
  filterReplyRowsBySyntheticParentStories,
  filterVisibleBadgePrivateReplies,
  getParentStoryLookupCapabilityForTests,
  getReplyIsDemoCapabilityForTests,
  isMissingOptionalColumnError,
  isSyntheticParentStory,
  resetMobileNavBadgeSourceFilteringCaches,
  resolveSyntheticParentStoryIds,
  type MobileNavBadgeReplySourceRow,
} from "./mobileNavBadgeSourceFiltering";
import {
  computeMobileNavBadgeCounts,
  isInboxBadgeInboxRow,
  isPrayerBadgeInboxRow,
  type MobileNavInboxRow,
} from "./mobileNavBadgeCounts";

const USER = "user-1";
const SENDER = "sender-1";

function reply(
  overrides: Partial<MobileNavBadgeReplySourceRow> = {}
): MobileNavBadgeReplySourceRow {
  return {
    id: "reply-1",
    story_id: "story-1",
    user_id: SENDER,
    recipient_user_id: USER,
    read_at: null,
    deleted_by_recipient: false,
    deleted_by_sender: false,
    ...overrides,
  };
}

function inboxRow(overrides: Partial<MobileNavInboxRow> = {}): MobileNavInboxRow {
  return {
    id: "inbox-1",
    read: false,
    ...overrides,
  };
}

describe("mobileNavBadgeSourceFiltering", () => {
  beforeEach(() => {
    resetMobileNavBadgeSourceFilteringCaches();
  });

  it("detects recognized missing-column errors only", () => {
    expect(
      isMissingOptionalColumnError({ code: "42703", message: 'column "is_demo" does not exist' }, "is_demo")
    ).toBe(true);
    expect(
      isMissingOptionalColumnError({ code: "PGRST204", message: "Could not find the 'creation_mode' column" }, "creation_mode")
    ).toBe(true);
    expect(
      isMissingOptionalColumnError({ code: "42501", message: "permission denied" }, "is_demo")
    ).toBe(false);
  });

  it("excludes is_demo === true replies when supported", () => {
    const visible = filterVisibleBadgePrivateReplies(
      [reply({ is_demo: true }), reply({ is_demo: false })],
      USER,
      { replyIsDemoSupported: true }
    );

    expect(visible).toHaveLength(1);
    expect(visible[0]?.is_demo).toBe(false);
  });

  it("retains is_demo false/null/undefined replies", () => {
    const visible = filterVisibleBadgePrivateReplies(
      [
        reply({ id: "a", is_demo: false }),
        reply({ id: "b", is_demo: null }),
        reply({ id: "c", is_demo: undefined }),
      ],
      USER,
      { replyIsDemoSupported: true }
    );

    expect(visible.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("falls back once when reply is_demo column is missing and caches unsupported", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: 'column "is_demo" does not exist' },
      })
      .mockResolvedValueOnce({
        data: [reply({ id: "kept" })],
        error: null,
      });

    const rows = await fetchBadgeStoryVideoReplies(query);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("is_demo");
    expect(query.mock.calls[1]?.[0]).not.toContain("is_demo");
    expect(rows).toHaveLength(1);
    expect(getReplyIsDemoCapabilityForTests()).toBe("unsupported");

    query.mockClear();
    query.mockResolvedValueOnce({
      data: [reply({ id: "cached" })],
      error: null,
    });

    await fetchBadgeStoryVideoReplies(query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).not.toContain("is_demo");
  });

  it("does not treat non-schema reply-query errors as missing-column fallback", async () => {
    const query = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table story_video_replies" },
    });

    await expect(fetchBadgeStoryVideoReplies(query)).rejects.toThrow(
      "permission denied"
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(getReplyIsDemoCapabilityForTests()).toBe("unknown");
  });

  it("excludes inbox rows connected to is_demo parent stories", async () => {
    const syntheticIds = await resolveSyntheticParentStoryIds(
      ["story-demo"],
      async (_ids, select) => ({
        data: [{ id: "story-demo", is_demo: true, creation_mode: null }],
        error: null,
      })
    );

    const filtered = filterInboxRowsBySyntheticParentStories(
      [
        inboxRow({ id: "keep", story_id: "story-real" }),
        inboxRow({ id: "drop", story_id: "story-demo" }),
        inboxRow({ id: "drop-prayer", prayer_request_id: "story-demo" }),
      ],
      syntheticIds
    );

    expect(filtered.map((row) => row.id)).toEqual(["keep"]);
    expect(getParentStoryLookupCapabilityForTests()).toBe("full");
  });

  it("excludes reply rows connected to is_demo parent stories", () => {
    const filtered = filterReplyRowsBySyntheticParentStories(
      [reply({ id: "drop", story_id: "story-demo" }), reply({ id: "keep", story_id: "story-real" })],
      new Set(["story-demo"])
    );

    expect(filtered.map((row) => row.id)).toEqual(["keep"]);
  });

  it("excludes rows connected to creation_mode loadtest parent stories", async () => {
    const syntheticIds = await resolveSyntheticParentStoryIds(
      ["story-loadtest"],
      async () => ({
        data: [{ id: "story-loadtest", is_demo: false, creation_mode: "loadtest" }],
        error: null,
      })
    );

    expect(isSyntheticParentStory({ id: "story-loadtest", creation_mode: "loadtest" })).toBe(
      true
    );
    expect(
      filterInboxRowsBySyntheticParentStories(
        [inboxRow({ id: "drop", story_id: "story-loadtest" })],
        syntheticIds
      )
    ).toHaveLength(0);
  });

  it("excludes rows connected to creation_mode load_test parent stories", async () => {
    const syntheticIds = await resolveSyntheticParentStoryIds(
      ["story-loadtest"],
      async () => ({
        data: [{ id: "story-loadtest", is_demo: false, creation_mode: "load_test" }],
        error: null,
      })
    );

    expect(
      filterReplyRowsBySyntheticParentStories(
        [reply({ id: "drop", story_id: "story-loadtest" })],
        syntheticIds
      ).map((row) => row.id)
    ).toEqual([]);
  });

  it("retains normal creation_mode parent stories", async () => {
    const syntheticIds = await resolveSyntheticParentStoryIds(
      ["story-normal"],
      async () => ({
        data: [{ id: "story-normal", is_demo: false, creation_mode: "creator-studio" }],
        error: null,
      })
    );

    expect(syntheticIds.size).toBe(0);
  });

  it("falls back from creation_mode to is_demo-only parent lookup", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'creation_mode' column" },
      })
      .mockResolvedValueOnce({
        data: [{ id: "story-demo", is_demo: true }],
        error: null,
      });

    const syntheticIds = await resolveSyntheticParentStoryIds(["story-demo"], query);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toContain("creation_mode");
    expect(query.mock.calls[1]?.[1]).toBe("id, is_demo");
    expect(getParentStoryLookupCapabilityForTests()).toBe("is_demo_only");
    expect(syntheticIds.has("story-demo")).toBe(true);
  });

  it("fails open when both optional parent-story columns are unavailable", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'creation_mode' column" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: 'column "is_demo" does not exist' },
      });

    const syntheticIds = await resolveSyntheticParentStoryIds(["story-1"], query);

    expect(syntheticIds.size).toBe(0);
    expect(getParentStoryLookupCapabilityForTests()).toBe("unavailable");

    query.mockClear();
    await resolveSyntheticParentStoryIds(["story-2"], query);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not break badges when optional parent-story lookup fails", async () => {
    const syntheticIds = await resolveSyntheticParentStoryIds(["story-1"], async () => ({
      data: null,
      error: { code: "503", message: "network timeout" },
    }));

    expect(syntheticIds.size).toBe(0);
  });

  it("excludes deleted_by_recipient and deleted_by_sender replies", () => {
    const visible = filterVisibleBadgePrivateReplies(
      [
        reply({ id: "recipient-delete", deleted_by_recipient: true }),
        reply({ id: "sender-delete", user_id: USER, deleted_by_sender: true }),
        reply({ id: "keep" }),
      ],
      USER,
      { replyIsDemoSupported: false }
    );

    expect(visible.map((row) => row.id)).toEqual(["keep"]);
  });

  it("excludes replies for another recipient", () => {
    const visible = filterVisibleBadgePrivateReplies(
      [reply({ id: "other", recipient_user_id: "someone-else" })],
      USER
    );

    expect(visible).toHaveLength(0);
  });

  it("deduplicates parent IDs before lookup", async () => {
    const query = vi.fn().mockResolvedValue({ data: [], error: null });

    const ids = collectParentStoryIds(
      [
        inboxRow({ story_id: "story-1", prayer_request_id: "story-1" }),
        inboxRow({ story_id: "story-2" }),
      ],
      [reply({ story_id: "story-1" }), reply({ story_id: "story-2" })]
    );

    expect(ids.sort()).toEqual(["story-1", "story-2"]);

    await resolveSyntheticParentStoryIds(ids, query);
    expect(query.mock.calls[0]?.[0]?.sort()).toEqual(["story-1", "story-2"]);
  });

  it("supports story_id and prayer_request_id parent references from inbox rows", () => {
    const ids = collectParentStoryIds(
      [
        inboxRow({ story_id: "story-a" }),
        inboxRow({ prayer_request_id: "prayer-b" }),
      ],
      []
    );

    expect(ids.sort()).toEqual(["prayer-b", "story-a"]);
  });

  it("preserves Prayer/Inbox classification after source filtering", async () => {
    const prayerRow = inboxRow({
      id: "prayer",
      category: "prayer",
      message_type: "prayer_update",
    });
    const privateRow = inboxRow({
      id: "private",
      sender_user_id: SENDER,
      thread_id: "thread-1",
      message_type: "prayer_video_reply",
      category: "prayer",
    });

    const { inboxRows, privateReplyRows } = await filterBadgeSourceRows(
      [prayerRow, privateRow],
      [],
      USER,
      async () => ({ data: [], error: null })
    );

    expect(isPrayerBadgeInboxRow(inboxRows[0]!)).toBe(true);
    expect(isInboxBadgeInboxRow(inboxRows[1]!)).toBe(true);

    const counts = computeMobileNavBadgeCounts(inboxRows, privateReplyRows, USER);
    expect(counts).toEqual({ prayerCount: 1, inboxCount: 1 });
  });

  it("does not import demo content modules from badge source filtering", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("./mobileNavBadgeSourceFiltering.ts", import.meta.url),
        "utf8"
      )
    );

    const forbidden = ["demo", "content"].join("-");
    expect(source.includes(forbidden)).toBe(false);
  });
});

describe("mobileNavBadgeSourceFiltering badge imports", () => {
  it("keeps badge navigation modules free of demo content imports", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      "mobileNavBadgeSourceFiltering.ts",
      "useMobileNavBadges.ts",
      "mobileNavBadgeCounts.ts",
      "mobileNavBadgeRefresh.ts",
      "mobileNavBadgeAccessibility.ts",
      "mobileNavBadgeTestMode.ts",
    ];

    const forbiddenImport = ["..", "demo", "content"].join("/");

    for (const file of files) {
      const source = await fs.readFile(path.join(dir, file), "utf8");
      expect(source.includes(forbiddenImport)).toBe(false);
    }
  });
});

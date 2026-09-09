import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_EXECUTOR_NOT_READY_NOTE,
  ACCOUNT_DELETION_STORY_VIDEO_REPLY_TREE_INVENTORY_NOTE,
} from "./accountDeletionDatabasePolicy";
import { buildAccountDeletionDatabasePlan } from "./accountDeletionDatabasePlan";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

const mockCreateClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORY_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type StoryVideoReplyGraphRow = {
  id: string;
  story_id: string;
  user_id: string | null;
  recipient_user_id: string | null;
  parent_reply_id: string | null;
};

type MockQueryState = {
  table: string;
  orFilter?: string;
  inColumn?: string;
  inValues?: string[];
  orderColumn?: string;
  orderAscending?: boolean;
  rangeFrom?: number;
  rangeTo?: number;
};

type MockSupabaseOptions = {
  rows: StoryVideoReplyGraphRow[];
  hooks?: {
    onTargetPage?: (pageIndex: number) => void;
    onChildPage?: (pageIndex: number, parentChunk: string[]) => void;
    onParentPage?: (pageIndex: number, idChunk: string[]) => void;
    targetPageErrorAfter?: number;
    childPageErrorAfter?: number;
    targetPageErrorOnPage?: number;
    childPageErrorOnPage?: number;
    infiniteChildGenerator?: (
      parentIds: readonly string[],
      callIndex: number
    ) => StoryVideoReplyGraphRow[] | "error";
  };
};

function replyId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function row(
  index: number,
  overrides: Partial<StoryVideoReplyGraphRow> = {}
): StoryVideoReplyGraphRow {
  return {
    id: replyId(index),
    story_id: STORY,
    user_id: TARGET,
    recipient_user_id: OTHER,
    parent_reply_id: null,
    ...overrides,
  };
}

function parseOrTargetUserId(orFilter: string): string | null {
  const match = orFilter.match(
    /user_id\.eq\.([^,]+),recipient_user_id\.eq\.([^,]+)/
  );
  return match?.[1] ?? null;
}

function executeMockQuery(
  allRows: StoryVideoReplyGraphRow[],
  state: MockQueryState,
  hooks?: MockSupabaseOptions["hooks"]
): { data: StoryVideoReplyGraphRow[] | null; error: unknown } {
  if (state.table !== "story_video_replies") {
    return { data: null, error: { message: "unknown table" } };
  }

  let filtered = [...allRows];

  if (state.orFilter) {
    const targetUserId = parseOrTargetUserId(state.orFilter);
    filtered = filtered.filter(
      (entry) =>
        entry.user_id === targetUserId ||
        entry.recipient_user_id === targetUserId
    );
  }

  if (state.inColumn && state.inValues) {
    const allowed = new Set(state.inValues);
    filtered = filtered.filter((entry) => {
      const value =
        state.inColumn === "id"
          ? entry.id
          : state.inColumn === "parent_reply_id"
            ? entry.parent_reply_id
            : null;
      return value != null && allowed.has(value);
    });
  }

  if (state.orderColumn) {
    filtered.sort((left, right) => {
      const leftValue = left[state.orderColumn as keyof StoryVideoReplyGraphRow];
      const rightValue = right[state.orderColumn as keyof StoryVideoReplyGraphRow];
      if (leftValue == null && rightValue == null) {
        return 0;
      }
      if (leftValue == null) {
        return state.orderAscending ? -1 : 1;
      }
      if (rightValue == null) {
        return state.orderAscending ? 1 : -1;
      }
      const cmp = String(leftValue).localeCompare(String(rightValue));
      return state.orderAscending ? cmp : -cmp;
    });
  }

  const from = state.rangeFrom ?? 0;
  const to = state.rangeTo ?? filtered.length - 1;
  const page = filtered.slice(from, to + 1);

  return { data: page, error: null };
}

function createMockSupabaseClient(options: MockSupabaseOptions) {
  let targetPageIndex = 0;
  let childPageIndex = 0;
  let parentPageIndex = 0;
  let childCallIndex = 0;

  return {
    from: (table: string) => {
      const state: MockQueryState = { table };
      const builder = {
        select: (_columns: string) => builder,
        or: (filter: string) => {
          state.orFilter = filter;
          return builder;
        },
        in: (column: string, values: string[]) => {
          state.inColumn = column;
          state.inValues = values;
          return builder;
        },
        order: (column: string, opts: { ascending: boolean }) => {
          state.orderColumn = column;
          state.orderAscending = opts.ascending;
          return builder;
        },
        range: async (from: number, to: number) => {
          state.rangeFrom = from;
          state.rangeTo = to;

          if (state.orFilter) {
            if (
              options.hooks?.targetPageErrorOnPage != null &&
              targetPageIndex === options.hooks.targetPageErrorOnPage
            ) {
              targetPageIndex += 1;
              return { data: null, error: { message: "target page error" } };
            }
            if (
              options.hooks?.targetPageErrorAfter != null &&
              targetPageIndex >= options.hooks.targetPageErrorAfter
            ) {
              targetPageIndex += 1;
              return { data: null, error: { message: "target page error" } };
            }
            options.hooks?.onTargetPage?.(targetPageIndex);
            targetPageIndex += 1;
            return executeMockQuery(options.rows, state, options.hooks);
          }

          if (state.inColumn === "parent_reply_id") {
            if (
              options.hooks?.childPageErrorOnPage != null &&
              childPageIndex === options.hooks.childPageErrorOnPage
            ) {
              childPageIndex += 1;
              return { data: null, error: { message: "child page error" } };
            }
            if (
              options.hooks?.childPageErrorAfter != null &&
              childPageIndex >= options.hooks.childPageErrorAfter
            ) {
              childPageIndex += 1;
              return { data: null, error: { message: "child page error" } };
            }
            options.hooks?.onChildPage?.(childPageIndex, state.inValues ?? []);
            childPageIndex += 1;

            if (options.hooks?.infiniteChildGenerator) {
              childCallIndex += 1;
              const generated = options.hooks.infiniteChildGenerator(
                state.inValues ?? [],
                childCallIndex
              );
              if (generated === "error") {
                return { data: null, error: { message: "child generator error" } };
              }
              const sorted = [...generated].sort((a, b) => a.id.localeCompare(b.id));
              return {
                data: sorted.slice(from, to + 1),
                error: null,
              };
            }

            return executeMockQuery(options.rows, state, options.hooks);
          }

          if (state.inColumn === "id") {
            options.hooks?.onParentPage?.(parentPageIndex, state.inValues ?? []);
            parentPageIndex += 1;
            return executeMockQuery(options.rows, state, options.hooks);
          }

          return executeMockQuery(options.rows, state, options.hooks);
        },
      };
      return builder;
    },
  };
}

async function loadBatch(
  rows: StoryVideoReplyGraphRow[],
  hooks?: MockSupabaseOptions["hooks"]
) {
  mockCreateClient.mockReturnValue(
    createMockSupabaseClient({ rows, hooks })
  );
  const { loadTargetReplyTreeInventoryBatch } = await import(
    "./accountDeletionStoryVideoReplyTreeInventory"
  );
  return loadTargetReplyTreeInventoryBatch(TARGET);
}

describe("reply-tree inventory architecture", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  afterEach(() => {
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  it("documents bidirectional fixed-point closure with pagination", async () => {
    const { REPLY_TREE_INVENTORY_ARCHITECTURE_NOTE, REPLY_TREE_QUERY_COMPLETENESS_NOTE } =
      await import("./accountDeletionStoryVideoReplyTreeInventory");
    expect(REPLY_TREE_INVENTORY_ARCHITECTURE_NOTE).toContain("fixed-point");
    expect(REPLY_TREE_INVENTORY_ARCHITECTURE_NOTE).toContain("Paginated");
    expect(REPLY_TREE_QUERY_COMPLETENESS_NOTE).toContain("page exhaustion");
    expect(ACCOUNT_DELETION_STORY_VIDEO_REPLY_TREE_INVENTORY_NOTE).toContain(
      "paginated target discovery"
    );
    expect(ACCOUNT_DELETION_STORY_VIDEO_REPLIES_EXECUTOR_NOT_READY_NOTE).toContain(
      "2B.3c"
    );
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });
});

describe("target-associated reply discovery", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  afterEach(() => {
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  it("returns ok=true with graphClosureComplete when target has zero replies", async () => {
    const batch = await loadBatch([]);
    expect(batch.ok).toBe(true);
    expect(batch.graphClosureComplete).toBe(true);
    expect(batch.expectedTargetReplyIds).toEqual([]);
    expect(batch.inventories).toEqual([]);
  });

  it("distinguishes zero replies from target list query failure", async () => {
    mockCreateClient.mockReturnValue(
      createMockSupabaseClient({
        rows: [],
        hooks: { targetPageErrorOnPage: 0 },
      })
    );
    const { loadTargetReplyTreeInventoryBatch } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const batch = await loadTargetReplyTreeInventoryBatch(TARGET);
    expect(batch.ok).toBe(false);
    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "TARGET_REPLY_LIST_QUERY_FAILED")
    ).toBe(true);
  });

  it("validates UUID before target query filter construction", async () => {
    mockCreateClient.mockReturnValue(createMockSupabaseClient({ rows: [] }));
    const { loadTargetReplyTreeInventoryBatch } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const batch = await loadTargetReplyTreeInventoryBatch("not-a-uuid");
    expect(batch.ok).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_GRAPH_MALFORMED")
    ).toBe(true);
  });
});

describe("graph completeness regressions", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  afterEach(() => {
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  it("discovers inbound cross-story child and fail-closes", async () => {
    const parent = row(1, {
      story_id: STORY,
      user_id: TARGET,
      recipient_user_id: TARGET,
      parent_reply_id: null,
    });
    const child = row(2, {
      story_id: STORY_B,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(1),
    });

    const batch = await loadBatch([parent, child]);
    const parentInventory = batch.inventories.find(
      (entry) => entry.replyId === replyId(1)
    );

    expect(parentInventory?.descendantReplyIds).toContain(replyId(2));
    expect(parentInventory?.hasCrossUserDescendant).toBe(true);
    expect(parentInventory?.crossStoryLinkDetected).toBe(true);
    expect(batch.graphClosureComplete).toBe(true);
    expect(batch.ok).toBe(false);

    const { validateTargetReplyTreeInventoryBatchForPlanning } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("discovers multi-hop cross-story descendants", async () => {
    const parent = row(10, {
      story_id: STORY,
      user_id: TARGET,
      recipient_user_id: TARGET,
    });
    const child = row(11, {
      story_id: STORY_B,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(10),
    });
    const grandchild = row(12, {
      story_id: STORY_C,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(11),
    });

    const batch = await loadBatch([parent, child, grandchild]);
    const parentInventory = batch.inventories.find(
      (entry) => entry.replyId === replyId(10)
    );

    expect(parentInventory?.descendantReplyIds).toEqual(
      expect.arrayContaining([replyId(11), replyId(12)])
    );
    expect(parentInventory?.hasCrossUserDescendant).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("discovers multi-hop ancestry through repeated parent expansion", async () => {
    const r1 = row(20, { story_id: STORY, user_id: OTHER, recipient_user_id: OTHER });
    const r2 = row(21, {
      story_id: STORY_B,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(20),
    });
    const r3 = row(22, {
      story_id: STORY_C,
      user_id: TARGET,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(21),
    });

    const batch = await loadBatch([r1, r2, r3]);
    const targetInventory = batch.inventories.find(
      (entry) => entry.replyId === replyId(22)
    );

    expect(batch.graphClosureComplete).toBe(true);
    expect(targetInventory?.crossStoryLinkDetected).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("loads same-story descendants completely", async () => {
    const batch = await loadBatch([
      row(30, { user_id: TARGET, recipient_user_id: OTHER }),
      row(31, {
        user_id: OTHER,
        recipient_user_id: TARGET,
        parent_reply_id: replyId(30),
      }),
    ]);
    const parent = batch.inventories.find((entry) => entry.replyId === replyId(30));
    expect(parent?.descendantReplyIds).toEqual([replyId(31)]);
    expect(parent?.hasCrossUserDescendant).toBe(true);
    expect(batch.graphClosureComplete).toBe(true);
    expect(batch.ok).toBe(true);
  });
});

describe("NULL participant ambiguity", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("marks target→NULL as ambiguous, not target-only", async () => {
    const batch = await loadBatch([
      row(40, { user_id: TARGET, recipient_user_id: null }),
    ]);
    const inventory = batch.inventories[0];
    expect(inventory?.targetOnlyOrSelf).toBe(false);
    expect(inventory?.hasAmbiguousParticipant).toBe(true);
    expect(
      inventory?.blockers.some((b) => b.code === "REPLY_TREE_AMBIGUOUS_PARTICIPANT")
    ).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("marks NULL→target as ambiguous, not target-only", async () => {
    const batch = await loadBatch([
      row(41, { user_id: null, recipient_user_id: TARGET }),
    ]);
    const inventory = batch.inventories[0];
    expect(inventory?.targetOnlyOrSelf).toBe(false);
    expect(inventory?.hasAmbiguousParticipant).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("marks NULL participant descendants as ambiguous", async () => {
    const batch = await loadBatch([
      row(42, { user_id: TARGET, recipient_user_id: OTHER }),
      row(43, {
        user_id: null,
        recipient_user_id: TARGET,
        parent_reply_id: replyId(42),
      }),
    ]);
    const parent = batch.inventories.find((entry) => entry.replyId === replyId(42));
    expect(parent?.hasAmbiguousDescendant).toBe(true);
    expect(batch.ok).toBe(false);
  });
});

describe("duplicate and query failures", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("dedupes identical overlapping rows", async () => {
    const single = row(50, { user_id: TARGET, recipient_user_id: TARGET });
    const batch = await loadBatch([single]);
    expect(batch.graphClosureComplete).toBe(true);
    expect(batch.ok).toBe(true);
  });

  it("blocks conflicting duplicate reply ids across sources", async () => {
    const base = row(51, { user_id: TARGET, recipient_user_id: TARGET });
    const batch = await loadBatch([base], {
      infiniteChildGenerator: (parentIds) => [
        { ...base, story_id: STORY_B, parent_reply_id: parentIds[0]! },
      ],
    });
    expect(batch.ok).toBe(false);
    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some(
        (b) => b.code === "REPLY_TREE_CONFLICTING_DUPLICATE_REPLY"
      )
    ).toBe(true);
  });

  it("fail-closes on child expansion query failure", async () => {
    const batch = await loadBatch(
      [row(52, { user_id: TARGET, recipient_user_id: TARGET })],
      { childPageErrorOnPage: 0 }
    );
    expect(batch.ok).toBe(false);
    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_CHILD_QUERY_FAILED")
    ).toBe(true);
  });

  it("fail-closes on parent expansion query failure", async () => {
    const brokenClient = {
      from: (table: string) => {
        const state: MockQueryState = { table };
        const builder = {
          select: () => builder,
          or: (filter: string) => {
            state.orFilter = filter;
            return builder;
          },
          in: (column: string, values: string[]) => {
            state.inColumn = column;
            state.inValues = values;
            return builder;
          },
          order: () => builder,
          range: async (from: number, to: number) => {
            state.rangeFrom = from;
            state.rangeTo = to;
            if (state.inColumn === "id") {
              return { data: null, error: { message: "parent error" } };
            }
            return executeMockQuery(
              [
                row(53, {
                  user_id: TARGET,
                  recipient_user_id: OTHER,
                  parent_reply_id: replyId(999),
                }),
              ],
              state
            );
          },
        };
        return builder;
      },
    };
    mockCreateClient.mockReturnValue(brokenClient);
    const { loadTargetReplyTreeInventoryBatch } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const batch = await loadTargetReplyTreeInventoryBatch(TARGET);
    expect(batch.ok).toBe(false);
    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_PARENT_QUERY_FAILED")
    ).toBe(true);
  });

  it("classifies orphan only when parent query succeeds but id absent", async () => {
    const batch = await loadBatch([
      row(54, {
        user_id: TARGET,
        recipient_user_id: OTHER,
        parent_reply_id: replyId(999),
      }),
    ]);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_PARENT_QUERY_FAILED")
    ).toBe(false);
    expect(batch.inventories[0]?.orphanParentDetected).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("blocks entire batch when child query fails on later page", async () => {
    const parent = row(55, { story_id: STORY, user_id: TARGET, recipient_user_id: TARGET });
    const child = row(56, {
      story_id: STORY_B,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(55),
    });
    process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE = "1";
    const batch = await loadBatch([parent, child], { childPageErrorOnPage: 1 });
    expect(batch.ok).toBe(false);
    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_CHILD_QUERY_FAILED")
    ).toBe(true);
  });
});

describe("cycle and depth handling", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
  });

  afterEach(() => {
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
  });

  it("detects self-parent", async () => {
    const batch = await loadBatch([
      row(60, {
        parent_reply_id: replyId(60),
        user_id: TARGET,
        recipient_user_id: OTHER,
      }),
    ]);
    expect(batch.inventories[0]?.cycleDetected).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("detects two-node cycle", async () => {
    const batch = await loadBatch([
      row(61, {
        user_id: TARGET,
        recipient_user_id: OTHER,
        parent_reply_id: replyId(62),
      }),
      row(62, {
        user_id: OTHER,
        recipient_user_id: TARGET,
        parent_reply_id: replyId(61),
      }),
    ]);
    expect(batch.inventories.some((entry) => entry.cycleDetected)).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("detects three-node cycle", async () => {
    const batch = await loadBatch([
      row(63, {
        user_id: TARGET,
        recipient_user_id: OTHER,
        parent_reply_id: replyId(65),
      }),
      row(64, { parent_reply_id: replyId(63), user_id: OTHER, recipient_user_id: OTHER }),
      row(65, { parent_reply_id: replyId(64), user_id: OTHER, recipient_user_id: OTHER }),
    ]);
    expect(batch.inventories.some((entry) => entry.cycleDetected)).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("supports descendant depth exactly at cap via round-by-round closure", async () => {
    const { REPLY_TREE_DEPTH_SAFETY_CAP } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const rows: StoryVideoReplyGraphRow[] = [];
    for (let depth = 0; depth <= REPLY_TREE_DEPTH_SAFETY_CAP; depth += 1) {
      rows.push(
        row(1000 + depth, {
          user_id: depth === 0 ? TARGET : OTHER,
          recipient_user_id: depth === 0 ? TARGET : OTHER,
          parent_reply_id: depth === 0 ? null : replyId(1000 + depth - 1),
        })
      );
    }
    const batch = await loadBatch(rows);
    const root = batch.inventories.find((entry) => entry.replyId === replyId(1000));
    expect(root?.maxDescendantDepth).toBe(REPLY_TREE_DEPTH_SAFETY_CAP);
    expect(
      root?.blockers.some((b) => b.code === "REPLY_TREE_DEPTH_LIMIT_EXCEEDED")
    ).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_GRAPH_CLOSURE_LIMIT_EXCEEDED")
    ).toBe(false);
    expect(batch.ok).toBe(true);
  });

  it("fail-closes on first depth beyond cap via round-by-round closure", async () => {
    const { REPLY_TREE_DEPTH_SAFETY_CAP } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const rows: StoryVideoReplyGraphRow[] = [];
    for (let depth = 0; depth <= REPLY_TREE_DEPTH_SAFETY_CAP + 1; depth += 1) {
      rows.push(
        row(2000 + depth, {
          user_id: depth === 0 ? TARGET : OTHER,
          recipient_user_id: depth === 0 ? TARGET : OTHER,
          parent_reply_id: depth === 0 ? null : replyId(2000 + depth - 1),
        })
      );
    }
    const batch = await loadBatch(rows);
    expect(batch.ok).toBe(false);
    expect(
      batch.inventories.some((entry) =>
        entry.blockers.some((b) => b.code === "REPLY_TREE_DEPTH_LIMIT_EXCEEDED")
      )
    ).toBe(true);
    expect(
      batch.blockers.some((b) => b.code === "REPLY_TREE_GRAPH_CLOSURE_LIMIT_EXCEEDED")
    ).toBe(false);
  });

  it("fail-closes when graph closure round cap exceeded", async () => {
    const parent = row(70, { user_id: TARGET, recipient_user_id: TARGET });
    let nextIndex = 7000;

    const batch = await loadBatch([parent], {
      infiniteChildGenerator: (parentIds) => {
        nextIndex += 1;
        return [
          row(nextIndex, {
            user_id: OTHER,
            recipient_user_id: OTHER,
            parent_reply_id: parentIds[0]!,
          }),
        ];
      },
    });

    expect(batch.graphClosureComplete).toBe(false);
    expect(
      batch.blockers.some(
        (b) => b.code === "REPLY_TREE_GRAPH_CLOSURE_LIMIT_EXCEEDED"
      )
    ).toBe(true);
  });
});

describe("pagination completeness", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE = "2";
    process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE = "2";
  });

  afterEach(() => {
    delete process.env.REPLY_TREE_TEST_QUERY_PAGE_SIZE;
    delete process.env.REPLY_TREE_TEST_ID_QUERY_CHUNK_SIZE;
  });

  it.each([
    { count: 0, label: "0 rows" },
    { count: 1, label: "1 row" },
    { count: 1, label: "PAGE_SIZE - 1" },
    { count: 2, label: "PAGE_SIZE" },
    { count: 3, label: "PAGE_SIZE + 1" },
    { count: 4, label: "2 * PAGE_SIZE" },
    { count: 5, label: "2 * PAGE_SIZE + 1" },
  ])("paginates target discovery for $label", async ({ count }) => {
    const rows = Array.from({ length: count }, (_, index) =>
      row(8000 + index, { user_id: TARGET, recipient_user_id: TARGET })
    );
    const batch = await loadBatch(rows);
    expect(batch.expectedTargetReplyIds).toHaveLength(count);
    expect(batch.inventories).toHaveLength(count);
  });

  it("discovers page-2 target-associated reply", async () => {
    const rows = [
      row(8100, { user_id: TARGET, recipient_user_id: TARGET }),
      row(8101, { user_id: TARGET, recipient_user_id: TARGET }),
      row(8102, { user_id: TARGET, recipient_user_id: TARGET }),
    ];
    const batch = await loadBatch(rows);
    expect(batch.expectedTargetReplyIds).toEqual(
      expect.arrayContaining([replyId(8100), replyId(8101), replyId(8102)])
    );
  });

  it("discovers child on page 2 and detects cross-user descendant", async () => {
    const parent = row(8200, {
      user_id: TARGET,
      recipient_user_id: TARGET,
    });
    const c1 = row(8201, {
      user_id: TARGET,
      recipient_user_id: TARGET,
      parent_reply_id: replyId(8200),
    });
    const c2 = row(8202, {
      story_id: STORY_B,
      user_id: OTHER,
      recipient_user_id: OTHER,
      parent_reply_id: replyId(8200),
    });
    const batch = await loadBatch([parent, c1, c2]);
    const inventory = batch.inventories.find(
      (entry) => entry.replyId === replyId(8200)
    );
    expect(inventory?.descendantReplyIds).toEqual(
      expect.arrayContaining([replyId(8201), replyId(8202)])
    );
    expect(inventory?.hasCrossUserDescendant).toBe(true);
    expect(batch.ok).toBe(false);
  });

  it("chunks parent id lookups across multiple chunks", async () => {
    const targetReplies = Array.from({ length: 5 }, (_, index) =>
      row(8300 + index, {
        user_id: TARGET,
        recipient_user_id: OTHER,
        parent_reply_id: replyId(9000 + index),
      })
    );
    const missingParents = Array.from({ length: 5 }, (_, index) =>
      row(9000 + index, { user_id: OTHER, recipient_user_id: OTHER })
    );
    const parentPageCalls: number[] = [];
    const batch = await loadBatch([...targetReplies, ...missingParents], {
      onParentPage: (_pageIndex, chunk) => {
        parentPageCalls.push(chunk.length);
      },
    });
    expect(parentPageCalls.length).toBeGreaterThan(1);
    expect(batch.graphClosureComplete).toBe(true);
  });

  it("fail-closes when target discovery page 2 errors", async () => {
    const rows = [
      row(8400, { user_id: TARGET, recipient_user_id: TARGET }),
      row(8401, { user_id: TARGET, recipient_user_id: TARGET }),
      row(8402, { user_id: TARGET, recipient_user_id: TARGET }),
    ];
    const batch = await loadBatch(rows, { targetPageErrorOnPage: 1 });
    expect(batch.ok).toBe(false);
    expect(
      batch.blockers.some((b) => b.code === "TARGET_REPLY_LIST_QUERY_FAILED")
    ).toBe(true);
  });
});

describe("fingerprints", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("changes when participant ownership swaps with same row count", async () => {
    const batchA = await loadBatch([
      row(300, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const batchB = await loadBatch([
      row(300, { user_id: OTHER, recipient_user_id: TARGET }),
    ]);
    expect(batchA.inventories[0]?.fingerprint).not.toBe(
      batchB.inventories[0]?.fingerprint
    );
  });

  it("changes when graphClosureComplete/blocker state changes", async () => {
    const clean = await loadBatch([
      row(310, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const blocked = await loadBatch([
      row(310, {
        user_id: TARGET,
        recipient_user_id: TARGET,
        parent_reply_id: replyId(999),
      }),
    ]);
    expect(clean.fingerprint).not.toBe(blocked.fingerprint);
  });
});

function buildForgedInventory(
  overrides: Partial<import("./accountDeletionStoryVideoReplyTreeInventory").ReplyTreeNodeInventory> = {}
) {
  const base = {
    replyId: replyId(900),
    storyId: STORY,
    userId: TARGET,
    recipientUserId: OTHER,
    parentReplyId: null,
    targetParticipantRoles: ["sender"] as const,
    childReplyIds: [],
    descendantReplyIds: [],
    targetOnlyOrSelf: false,
    hasAmbiguousParticipant: false,
    hasSurvivingParticipant: true,
    directChildCount: 0,
    descendantCount: 0,
    hasCrossUserDescendant: false,
    hasAmbiguousDescendant: false,
    ancestryComplete: true,
    descendantsComplete: true,
    cycleDetected: false,
    crossStoryLinkDetected: false,
    orphanParentDetected: false,
    maxDescendantDepth: 0,
    blockers: [],
    fingerprint: "",
    ...overrides,
  };
  return base;
}

describe("trust-boundary security regressions", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("production loader does not accept injected deps at type level", async () => {
    const { loadTargetReplyTreeInventoryBatch } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    type ProductionArgs = Parameters<typeof loadTargetReplyTreeInventoryBatch>;
    type HasInjectedDeps = 2 extends ProductionArgs["length"] ? true : false;
    const guard: HasInjectedDeps = false;
    expect(guard).toBe(false);
  });

  it("does not export loadTargetReplyTreeInventoryBatchForTesting", async () => {
    const moduleExports = await import("./accountDeletionStoryVideoReplyTreeInventory");
    expect(moduleExports).not.toHaveProperty(
      "loadTargetReplyTreeInventoryBatchForTesting"
    );
    expect(moduleExports).not.toHaveProperty(
      "ReplyTreeInventoryQueryDepsForTesting"
    );
  });

  it("rejects plain forged inventory batch", async () => {
    const { computeReplyTreeNodeFingerprint, validateTargetReplyTreeInventoryBatchForPlanning } =
      await import("./accountDeletionStoryVideoReplyTreeInventory");
    const forgedInventory = {
      ...buildForgedInventory(),
      fingerprint: computeReplyTreeNodeFingerprint({
        inventory: buildForgedInventory(),
      }),
    };
    const forged = {
      ok: true,
      targetUserId: TARGET,
      expectedTargetReplyIds: [replyId(900)],
      inventories: [forgedInventory],
      blockers: [],
      graphClosureComplete: true,
      fingerprint: "forged",
    };
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch: forged,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects untrusted pure candidate builder output", async () => {
    const {
      buildUntrustedTargetReplyTreeInventoryBatchFromLoadedGraph,
      validateTargetReplyTreeInventoryBatchForPlanning,
    } = await import("./accountDeletionStoryVideoReplyTreeInventory");
    const candidate = buildUntrustedTargetReplyTreeInventoryBatchFromLoadedGraph({
      targetUserId: TARGET,
      rows: [row(420, { user_id: TARGET, recipient_user_id: TARGET })],
      graphClosureComplete: true,
    });
    expect(candidate.ok).toBe(true);
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch: candidate,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("rejects JSON-parsed lookalike batch", async () => {
    const batch = await loadBatch([
      row(400, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const { validateTargetReplyTreeInventoryBatchForPlanning } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const parsed = JSON.parse(JSON.stringify(batch));
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch: parsed,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("failed batch has no planning authority", async () => {
    const batch = await loadBatch([
      row(410, {
        user_id: TARGET,
        recipient_user_id: OTHER,
        parent_reply_id: replyId(999),
      }),
    ]);
    expect(batch.ok).toBe(false);
    const { validateTargetReplyTreeInventoryBatchForPlanning } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(false);
  });

  it("accepts same-process genuine production loader batch when graph is safe", async () => {
    const batch = await loadBatch([
      row(420, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const { validateTargetReplyTreeInventoryBatchForPlanning } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    const validation = validateTargetReplyTreeInventoryBatchForPlanning({
      batch,
      manifestTargetUserId: TARGET,
    });
    expect(validation.ok).toBe(true);
  });
});

describe("read-only and execution safety", () => {
  it("does not contain mutation calls in inventory module", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStoryVideoReplyTreeInventory.ts",
      "utf8"
    );
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain(".upsert(");
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("storage.from");
  });

  it("does not wire reply-tree loader into database plan — batch is caller-supplied", () => {
    const planSource = readFileSync(
      "lib/server/accountDeletionDatabasePlan.ts",
      "utf8"
    );
    expect(planSource).not.toContain("loadTargetReplyTreeInventoryBatch");
    expect(planSource).toContain("replyTreeInventoryBatch");
    expect(planSource).toContain("buildStoryVideoReplyMutationPlan");
  });

  it("database plan blocks when reply-tree inventory batch is missing", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: {
        identity: {
          requestId: "req",
          targetUserId: TARGET,
          username: "u",
          displayName: "U",
          email: "u@example.com",
          requestStatus: "approved",
          requestCreatedAt: "2026-01-01T00:00:00.000Z",
          authUserExists: true,
          isOwner: false,
          isAdmin: false,
        },
        blocked: false,
        blockCode: null,
        database: {
          hardDelete: [],
          anonymize: [],
          preserve: [],
          manualReview: [],
        },
        storage: { objects: [] },
        journey: {
          recipientOwnedRows: {
            table: "inbox_messages",
            count: 0,
            plannedAction: "hard_delete",
          },
          sentToOtherUserRows: {
            table: "inbox_messages",
            count: 0,
            plannedAction: "preserve_anonymized",
          },
          privateMediaObjects: [],
          relationshipNotes: [],
          journeyReferenceInventoryComplete: true,
          unresolvedJourneyReferenceCount: 0,
        },
        publicContent: { stories: [], profileFieldsToStrip: [] },
        audit: { retain: [], deletionRequestRetentionWarning: "" },
        warnings: [],
        schemaRequirements: [],
        counts: {
          hardDeleteRows: 0,
          anonymizeRows: 0,
          preserveRows: 0,
          manualReviewRows: 0,
          storageObjects: 0,
          unresolvedWarnings: 0,
        },
      },
      replyTreeInventoryBatch: undefined as unknown as import("./accountDeletionStoryVideoReplyTreeInventory").TargetReplyTreeInventoryBatch,
    });
    expect(plan.blockedExecution).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(0);
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });
});

describe("Production-scale assumptions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not hard-code Production row count 52", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStoryVideoReplyTreeInventory.ts",
      "utf8"
    );
    expect(source).not.toContain("52");
  });

  it("documents snapshot limitation without claiming isolation", async () => {
    const { REPLY_TREE_INVENTORY_SNAPSHOT_LIMITATION_NOTE } = await import(
      "./accountDeletionStoryVideoReplyTreeInventory"
    );
    expect(REPLY_TREE_INVENTORY_SNAPSHOT_LIMITATION_NOTE).toContain(
      "do not provide transactional snapshot isolation"
    );
    expect(REPLY_TREE_INVENTORY_SNAPSHOT_LIMITATION_NOTE).toContain(
      "after deletion write freeze"
    );
  });
});

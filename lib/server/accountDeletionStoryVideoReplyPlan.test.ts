import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_NO_HARD_DELETE_INVARIANT,
} from "./accountDeletionStoryVideoReplyPlan";
import { buildUntrustedTargetReplyTreeInventoryBatchFromLoadedGraph } from "./accountDeletionStoryVideoReplyTreeInventory";
import { classifyDatabaseTablePolicy } from "./accountDeletionDatabasePolicy";
import {
  buildAccountDeletionDatabasePlan,
  planHasGenericStoryVideoReplyExecutionEntries,
  validateDatabasePlanInvariants,
} from "./accountDeletionDatabasePlan";
import type { TargetReplyTreeInventoryBatch } from "./accountDeletionStoryVideoReplyTreeInventory";
import type { AccountDeletionManifest } from "./accountDeletionManifest";

const mockCreateClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const TARGET = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";
const STORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type StoryVideoReplyGraphRow = {
  id: string;
  story_id: string;
  user_id: string | null;
  recipient_user_id: string | null;
  parent_reply_id: string | null;
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

function createMockSupabaseClient(rows: StoryVideoReplyGraphRow[]) {
  return {
    from: (table: string) => {
      const state: {
        table: string;
        orFilter?: string;
        inColumn?: string;
        inValues?: string[];
        orderColumn?: string;
        orderAscending?: boolean;
        rangeFrom?: number;
        rangeTo?: number;
      } = { table };

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
          let filtered = [...rows];
          if (state.orFilter) {
            const match = state.orFilter.match(
              /user_id\.eq\.([^,]+),recipient_user_id\.eq\.([^,]+)/
            );
            const targetUserId = match?.[1];
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
            filtered.sort((left, right) =>
              String(left.id).localeCompare(String(right.id))
            );
          }
          return { data: filtered.slice(from, to + 1), error: null };
        },
      };
      return builder;
    },
  };
}

async function loadBatch(rows: StoryVideoReplyGraphRow[]) {
  mockCreateClient.mockReturnValue(createMockSupabaseClient(rows));
  const inventoryModule = await import("./accountDeletionStoryVideoReplyTreeInventory");
  return inventoryModule.loadTargetReplyTreeInventoryBatch(TARGET);
}

async function buildPlan(
  batch: Awaited<ReturnType<typeof loadBatch>>,
  manifestTargetUserId: string = TARGET
) {
  const planModule = await import("./accountDeletionStoryVideoReplyPlan");
  return planModule.buildStoryVideoReplyMutationPlan({
    batch,
    manifestTargetUserId,
  });
}

function buildManifestWithReplyCount(count: number): AccountDeletionManifest {
  return {
    identity: {
      requestId: "req-1",
      targetUserId: TARGET,
      username: "member",
      displayName: "Member",
      email: "member@example.com",
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
      anonymize:
        count > 0
          ? [{ table: "story_video_replies", count, plannedAction: "preserve_anonymized" }]
          : [],
      preserve: [],
      manualReview: [],
    },
    storage: { objects: [] },
    journey: {
      recipientOwnedRows: { table: "inbox_messages", count: 0, plannedAction: "hard_delete" },
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
      anonymizeRows: count,
      preserveRows: 0,
      manualReviewRows: 0,
      storageObjects: 0,
      unresolvedWarnings: 0,
    },
  };
}

describe("accountDeletionStoryVideoReplyPlan authority", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("accepts valid trusted 2B.3b batch", async () => {
    const batch = await loadBatch([
      row(1, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const plan = await buildPlan(batch);
    expect(plan.ok).toBe(true);
    expect(plan.blockedExecution).toBe(false);
    expect(plan.plannedReplyMutationCount).toBe(1);
  });

  it("blocks missing reply-tree inventory batch fail-closed", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: undefined as unknown as TargetReplyTreeInventoryBatch,
    });
    expect(plan.storyVideoReplyPlan.blockedExecution).toBe(true);
    expect(plan.blockedExecution).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(0);
    expect(planHasGenericStoryVideoReplyExecutionEntries(plan)).toBe(false);
  });

  it("rejects forged batch", async () => {
    const batch = await loadBatch([row(2)]);
    const forged = { ...batch, ok: false };
    const plan = await buildPlan(forged);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("rejects JSON clone", async () => {
    const batch = await loadBatch([row(3, { user_id: TARGET, recipient_user_id: TARGET })]);
    const parsed = JSON.parse(JSON.stringify(batch));
    const plan = await buildPlan(parsed);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("rejects spread clone", async () => {
    const batch = await loadBatch([row(4)]);
    const spread = { ...batch };
    const plan = await buildPlan(spread);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("rejects untrusted graph-builder batch", async () => {
    const candidate = buildUntrustedTargetReplyTreeInventoryBatchFromLoadedGraph({
      targetUserId: TARGET,
      rows: [row(5, { user_id: TARGET, recipient_user_id: OTHER })],
      graphClosureComplete: true,
    });
    const plan = await buildPlan(candidate);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("rejects target mismatch", async () => {
    const batch = await loadBatch([row(6)]);
    const plan = await buildPlan(batch, OTHER);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("rejects failed inventory", async () => {
    const batch = await loadBatch([
      row(7, { user_id: TARGET, recipient_user_id: OTHER, parent_reply_id: replyId(999) }),
    ]);
    expect(batch.ok).toBe(false);
    const plan = await buildPlan(batch);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("accepts valid zero-reply inventory", async () => {
    const batch = await loadBatch([]);
    expect(batch.ok).toBe(true);
    expect(batch.expectedTargetReplyIds).toHaveLength(0);
    const plan = await buildPlan(batch);
    expect(plan.ok).toBe(true);
    expect(plan.mutationIntents).toHaveLength(0);
    expect(plan.blockedExecution).toBe(false);
  });
});

describe("accountDeletionStoryVideoReplyPlan case matrix", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("plans A→B as detach author + tombstone", async () => {
    const batch = await loadBatch([
      row(10, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const plan = await buildPlan(batch);
    const intent = plan.mutationIntents[0];
    expect(intent?.action).toBe("DETACH_TARGET_AUTHOR_AND_TOMBSTONE");
    expect(intent?.setUserIdNull).toBe(true);
    expect(intent?.setRecipientUserIdNull).toBe(false);
    expect(intent?.replaceMessageWithTombstone).toBe(true);
    expect(intent?.messageReplacement).toBe(ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE);
    expect(intent?.setDeletedBySenderTrue).toBe(true);
    expect(intent?.setDeletedByRecipientTrue).toBe(false);
  });

  it("plans B→A as detach recipient without message change", async () => {
    const batch = await loadBatch([
      row(11, { user_id: OTHER, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    const intent = plan.mutationIntents[0];
    expect(intent?.action).toBe("DETACH_TARGET_RECIPIENT");
    expect(intent?.setUserIdNull).toBe(false);
    expect(intent?.setRecipientUserIdNull).toBe(true);
    expect(intent?.replaceMessageWithTombstone).toBe(false);
    expect(intent?.messageReplacement).toBeUndefined();
    expect(intent?.setDeletedBySenderTrue).toBe(false);
    expect(intent?.setDeletedByRecipientTrue).toBe(true);
  });

  it("plans A→A as self detach + tombstone + both flags", async () => {
    const batch = await loadBatch([
      row(12, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    const intent = plan.mutationIntents[0];
    expect(intent?.action).toBe("DETACH_TARGET_SELF_AND_TOMBSTONE");
    expect(intent?.setUserIdNull).toBe(true);
    expect(intent?.setRecipientUserIdNull).toBe(true);
    expect(intent?.replaceMessageWithTombstone).toBe(true);
    expect(intent?.setDeletedBySenderTrue).toBe(true);
    expect(intent?.setDeletedByRecipientTrue).toBe(true);
  });

  it("blocks A→NULL via inventory validation", async () => {
    const batch = await loadBatch([
      row(13, { user_id: TARGET, recipient_user_id: null }),
    ]);
    expect(batch.ok).toBe(false);
    const plan = await buildPlan(batch);
    expect(plan.ok).toBe(false);
    expect(plan.blockedExecution).toBe(true);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("blocks NULL→A via inventory validation", async () => {
    const batch = await loadBatch([
      row(14, { user_id: null, recipient_user_id: TARGET }),
    ]);
    expect(batch.ok).toBe(false);
    const plan = await buildPlan(batch);
    expect(plan.ok).toBe(false);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("blocks NULL→NULL target-associated ambiguity", async () => {
    const batch = await loadBatch([
      row(15, { user_id: null, recipient_user_id: null }),
    ]);
    expect(batch.expectedTargetReplyIds).toHaveLength(0);
    expect(batch.ok).toBe(true);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents).toHaveLength(0);
  });

  it("does not mutate non-target graph neighbors", async () => {
    const parent = row(20, { user_id: TARGET, recipient_user_id: TARGET });
    const child = row(21, {
      user_id: OTHER,
      recipient_user_id: THIRD,
      parent_reply_id: parent.id,
    });
    const batch = await loadBatch([parent, child]);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents).toHaveLength(1);
    expect(plan.mutationIntents[0]?.replyId).toBe(parent.id);
  });
});

describe("accountDeletionStoryVideoReplyPlan tree scenarios", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("target parent + surviving child preserves child and parent_reply_id", async () => {
    const parent = row(30, { user_id: TARGET, recipient_user_id: TARGET });
    const child = row(31, {
      user_id: OTHER,
      recipient_user_id: THIRD,
      parent_reply_id: parent.id,
    });
    const batch = await loadBatch([parent, child]);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents).toHaveLength(1);
    expect(plan.mutationIntents[0]?.replyId).toBe(parent.id);
    expect(plan.mutationIntents[0]?.parentReplyId).toBeNull();
    expect(plan.mutationIntents[0]?.preserveParentReplyId).toBe(true);
    expect(plan.mutationIntents[0]?.storyId).toBe(STORY);
  });

  it("target parent + target child + surviving grandchild", async () => {
    const parent = row(40, { user_id: TARGET, recipient_user_id: TARGET });
    const child = row(41, {
      user_id: TARGET,
      recipient_user_id: TARGET,
      parent_reply_id: parent.id,
    });
    const grandchild = row(42, {
      user_id: OTHER,
      recipient_user_id: THIRD,
      parent_reply_id: child.id,
    });
    const batch = await loadBatch([parent, child, grandchild]);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents.map((entry) => entry.replyId).sort()).toEqual(
      [parent.id, child.id].sort()
    );
    expect(plan.mutationIntents.every((entry) => entry.replaceMessageWithTombstone)).toBe(
      true
    );
    const childIntent = plan.mutationIntents.find((entry) => entry.replyId === child.id);
    expect(childIntent?.parentReplyId).toBe(parent.id);
  });

  it("surviving parent + target child", async () => {
    const parent = row(50, { user_id: OTHER, recipient_user_id: THIRD });
    const child = row(51, {
      user_id: TARGET,
      recipient_user_id: OTHER,
      parent_reply_id: parent.id,
    });
    const batch = await loadBatch([parent, child]);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents).toHaveLength(1);
    expect(plan.mutationIntents[0]?.replyId).toBe(child.id);
    expect(plan.mutationIntents[0]?.parentReplyId).toBe(parent.id);
    expect(plan.mutationIntents[0]?.action).toBe("DETACH_TARGET_AUTHOR_AND_TOMBSTONE");
  });
});

describe("accountDeletionStoryVideoReplyPlan invariants", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("uses deterministic tombstone constant", async () => {
    const batch = await loadBatch([row(60, { user_id: TARGET, recipient_user_id: OTHER })]);
    const plan = await buildPlan(batch);
    expect(plan.mutationIntents[0]?.messageReplacement).toBe(
      ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE
    );
    expect(ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE).toBe(
      "Message removed because the sender deleted their account."
    );
  });

  it("registry contains no story_video_replies HARD_DELETE", () => {
    const policies = classifyDatabaseTablePolicy("story_video_replies");
    expect(policies.some((entry) => entry.action === "HARD_DELETE")).toBe(false);
    expect(
      ACCOUNT_DELETION_STORY_VIDEO_REPLIES_NO_HARD_DELETE_INVARIANT
    ).toContain("NEVER produce HARD_DELETE");
  });

  it("rejects forged database plan with story_video_replies HARD_DELETE", async () => {
    const batch = await loadBatch([]);
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: batch,
    });
    plan.hardDelete.push({
      table: "story_video_replies",
      action: "HARD_DELETE",
      selector: "malicious",
      estimatedCount: 1,
      reason: "forged",
      orderHint: 999,
      identityFields: [],
      dependencyNotes: [],
    });
    expect(validateDatabasePlanInvariants(plan).ok).toBe(false);
  });

  it("does not introduce executable DB mutations in plan module", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStoryVideoReplyPlan.ts",
      "utf8"
    );
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".upsert(");
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("auth.admin");
  });

  it("documents atomic execution requirement", () => {
    const source = readFileSync(
      "lib/server/accountDeletionStoryVideoReplyPlan.ts",
      "utf8"
    );
    expect(source).toContain("atomically");
    expect(source).toContain("single transaction");
  });

  it("validates exact target reply coverage", async () => {
    const batch = await loadBatch([
      row(70, { user_id: TARGET, recipient_user_id: OTHER }),
      row(71, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    expect(plan.expectedReplyCount).toBe(2);
    expect(plan.plannedReplyMutationCount).toBe(2);
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    const validation = planModule.validateStoryVideoReplyMutationPlanInvariants({
      targetUserId: TARGET,
      mutationIntents: plan.mutationIntents,
      batch,
    });
    expect(validation.ok).toBe(true);
  });
});

describe("accountDeletionStoryVideoReplyPlan database integration", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("integrates trusted batch into database plan without loader calls", async () => {
    const batch = await loadBatch([row(80, { user_id: TARGET, recipient_user_id: OTHER })]);
    const { buildAccountDeletionDatabasePlan } = await import("./accountDeletionDatabasePlan");
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(1),
      replyTreeInventoryBatch: batch,
    });
    expect(plan.storyVideoReplyPlan.ok).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(1);
    expect(planHasGenericStoryVideoReplyExecutionEntries(plan)).toBe(false);
    const planSource = readFileSync(
      "lib/server/accountDeletionDatabasePlan.ts",
      "utf8"
    );
    expect(planSource).not.toContain("loadTargetReplyTreeInventoryBatch");
  });

  it("manifest undercount does not suppress dedicated reply planning", async () => {
    const batch = await loadBatch([
      row(81, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: batch,
    });
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(1);
    expect(plan.storyVideoReplyPlan.mutationIntents[0]?.action).toBe(
      "DETACH_TARGET_AUTHOR_AND_TOMBSTONE"
    );
    expect(planHasGenericStoryVideoReplyExecutionEntries(plan)).toBe(false);
  });

  it("missing batch is blocked even when manifest count is zero", () => {
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: undefined as unknown as TargetReplyTreeInventoryBatch,
    });
    expect(plan.blockedExecution).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(0);
  });

  it("valid zero-reply batch continues planning without reply blocker", async () => {
    const batch = await loadBatch([]);
    const { buildAccountDeletionDatabasePlan } = await import("./accountDeletionDatabasePlan");
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: batch,
    });
    expect(plan.storyVideoReplyPlan.ok).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(0);
    expect(planHasGenericStoryVideoReplyExecutionEntries(plan)).toBe(false);
    expect(
      plan.blocked.some((entry) => entry.table === "story_video_replies")
    ).toBe(false);
  });

  it("failed inventory has zero generic story_video_replies execution entries", async () => {
    const batch = await loadBatch([
      row(82, { user_id: TARGET, recipient_user_id: null }),
    ]);
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(3),
      replyTreeInventoryBatch: batch,
    });
    expect(plan.blockedExecution).toBe(true);
    expect(plan.storyVideoReplyPlan.mutationIntents).toHaveLength(0);
    expect(planHasGenericStoryVideoReplyExecutionEntries(plan)).toBe(false);
  });

  it("rejects forged generic detach entries in database plan invariants", async () => {
    const batch = await loadBatch([]);
    const plan = buildAccountDeletionDatabasePlan({
      manifest: buildManifestWithReplyCount(0),
      replyTreeInventoryBatch: batch,
    });
    for (const bucket of ["hardDelete", "anonymize", "detach", "preserve"] as const) {
      plan[bucket].push({
        table: "story_video_replies",
        action: bucket === "hardDelete" ? "HARD_DELETE" : bucket === "anonymize" ? "ANONYMIZE" : bucket === "detach" ? "DETACH" : "PRESERVE",
        selector: "forged",
        estimatedCount: 1,
        reason: "forged",
        orderHint: 999,
        identityFields: [],
        dependencyNotes: [],
      });
      expect(validateDatabasePlanInvariants(plan).ok).toBe(false);
      plan[bucket].pop();
    }
  });
});

describe("accountDeletionStoryVideoReplyPlan malformed intent regressions", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  async function validBatchAndIntent() {
    const batch = await loadBatch([
      row(90, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const plan = await buildPlan(batch);
    return { batch, intent: { ...plan.mutationIntents[0]! } };
  }

  it("rejects A→B intent with setUserIdNull=false", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.setUserIdNull = false;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects A→B intent without tombstone", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.replaceMessageWithTombstone = false;
    intent.messageReplacement = undefined;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects A→B intent with deleted_by_recipient=true", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.setDeletedByRecipientTrue = true;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  async function validSelfBatchAndIntent() {
    const batch = await loadBatch([
      row(94, { user_id: TARGET, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    return { batch, intent: { ...plan.mutationIntents[0]! } };
  }

  it("rejects A→A intent with only one participant ID detached", async () => {
    const { batch, intent } = await validSelfBatchAndIntent();
    intent.setRecipientUserIdNull = false;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects A→A intent with only one delete flag", async () => {
    const { batch, intent } = await validSelfBatchAndIntent();
    intent.setDeletedByRecipientTrue = false;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects intent with preserveParentReplyId=false", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.preserveParentReplyId = false as unknown as true;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects intent with preserveStoryId=false", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.preserveStoryId = false as unknown as true;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects B→A intent with tombstone", async () => {
    const batch = await loadBatch([
      row(91, { user_id: OTHER, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    const intent = { ...plan.mutationIntents[0]! };
    intent.replaceMessageWithTombstone = true;
    intent.messageReplacement = ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects B→A intent with setUserIdNull=true", async () => {
    const batch = await loadBatch([
      row(92, { user_id: OTHER, recipient_user_id: TARGET }),
    ]);
    const plan = await buildPlan(batch);
    const intent = { ...plan.mutationIntents[0]! };
    intent.setUserIdNull = true;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("rejects wrong tombstone string", async () => {
    const { batch, intent } = await validBatchAndIntent();
    intent.messageReplacement = "wrong tombstone" as typeof ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE;
    const planModule = await import("./accountDeletionStoryVideoReplyPlan");
    expect(
      planModule.validateStoryVideoReplyMutationPlanInvariants({
        targetUserId: TARGET,
        mutationIntents: [intent],
        batch,
      }).ok
    ).toBe(false);
  });

  it("freezes successful reply mutation plans", async () => {
    const batch = await loadBatch([
      row(93, { user_id: TARGET, recipient_user_id: OTHER }),
    ]);
    const plan = await buildPlan(batch);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.mutationIntents)).toBe(true);
    expect(Object.isFrozen(plan.mutationIntents[0])).toBe(true);
  });
});

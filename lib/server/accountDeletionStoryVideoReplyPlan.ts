import type { ReplyTreeNodeInventory } from "./accountDeletionStoryVideoReplyTreeInventory";
import {
  validateTargetReplyTreeInventoryBatchForPlanning,
  type ReplyTreeSafetyBlocker,
  type TargetReplyTreeInventoryBatch,
} from "./accountDeletionStoryVideoReplyTreeInventory";

/** Fixed server-owned tombstone for target-authored reply text after account deletion. */
export const ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE =
  "Message removed because the sender deleted their account." as const;

/** Absolute invariant — account deletion must never HARD_DELETE story_video_replies rows. */
export const ACCOUNT_DELETION_STORY_VIDEO_REPLIES_NO_HARD_DELETE_INVARIANT =
  "Account deletion must NEVER produce HARD_DELETE for public.story_video_replies — preserve row, detach target identity, tombstone target-authored message only." as const;

/** Reply mutations execute only from dedicated storyVideoReplyPlan — never generic database-plan buckets. */
export const ACCOUNT_DELETION_STORY_VIDEO_REPLIES_DEDICATED_PLAN_ONLY_INVARIANT =
  "Account-deletion mutations for public.story_video_replies may only be executed from validated storyVideoReplyPlan.mutationIntents derived from a trusted authoritative reply-tree inventory — generic database-plan table entries must never execute mutations for this table." as const;

/**
 * Manifest story_video_replies counts are informational diagnostics only — they must not
 * authorize skipping inventory, select reply IDs, or override authoritative batch coverage.
 */
export const ACCOUNT_DELETION_REPLY_MANIFEST_COUNT_DIAGNOSTIC_NOTE =
  "Manifest story_video_replies row counts are diagnostics only — authoritative reply-tree inventory is always required for database planning." as const;

/**
 * When replaceMessageWithTombstone is false, the future executor must exclude message from
 * the UPDATE SET list entirely — do not copy surviving message text into the intent.
 */
export const ACCOUNT_DELETION_REPLY_MESSAGE_EXCLUSION_NOTE =
  "replaceMessageWithTombstone=false means the message column is excluded from future UPDATE SET — surviving sender content must remain byte-for-byte in the database." as const;

/** Future executor must validate or rebuild the plan immediately before mutation. */
export const ACCOUNT_DELETION_REPLY_PLAN_MUTABILITY_NOTE =
  "StoryVideoReplyMutationPlan objects are shallow-frozen after build — future executor must re-validate or rebuild from trusted inventory immediately before mutation and must never trust caller-mutated plan objects." as const;

/**
 * Content ownership for story_video_replies at authoritative inventory time:
 * the non-null sender (user_id) owns message content.
 * Target-authored content only when user_id === targetUserId.
 * Target recipient status alone NEVER permits message modification.
 * A NULL sender is ambiguous ownership — must BLOCK planning.
 */
export const ACCOUNT_DELETION_REPLY_CONTENT_OWNERSHIP_RULE =
  "story_video_replies content owner = non-null user_id at inventory time; only target sender rows may be tombstoned." as const;

/**
 * Future executor invariant (not implemented in 2B.3c):
 * all reply intents from one authoritative post-freeze inventory must execute
 * atomically in one database transaction; rollback all on failure.
 */
export const ACCOUNT_DELETION_REPLY_MUTATION_ATOMIC_EXECUTION_NOTE =
  "All story_video_replies mutation intents from one validated inventory batch must execute atomically in a single transaction — independent per-row commits are unsafe because post-detach inventory may not rediscover processed rows." as const;

/** Documented future deletion orchestration order (planning reference only). */
export const ACCOUNT_DELETION_REPLY_EXECUTION_ORDER_NOTE =
  "Future order: deletion_in_progress → session block → rebuild story + reply inventories → validate → build plan → atomic reply detach/tombstone → other DB stages → storage → profile → auth.users LAST." as const;

export const ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE =
  "REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE" as const;

export type StoryVideoReplyMutationAction =
  | "DETACH_TARGET_AUTHOR_AND_TOMBSTONE"
  | "DETACH_TARGET_RECIPIENT"
  | "DETACH_TARGET_SELF_AND_TOMBSTONE";

export type StoryVideoReplyMutationIntent = {
  replyId: string;
  storyId: string;
  parentReplyId: string | null;
  action: StoryVideoReplyMutationAction;
  setUserIdNull: boolean;
  setRecipientUserIdNull: boolean;
  replaceMessageWithTombstone: boolean;
  messageReplacement?: typeof ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE;
  setDeletedBySenderTrue: boolean;
  setDeletedByRecipientTrue: boolean;
  preserveParentReplyId: true;
  preserveStoryId: true;
  reason: string;
};

export type StoryVideoReplyMutationPlan = {
  targetUserId: string;
  ok: boolean;
  blockedExecution: boolean;
  blockCode: string | null;
  blockers: readonly ReplyTreeSafetyBlocker[];
  expectedReplyCount: number;
  plannedReplyMutationCount: number;
  mutationIntents: readonly StoryVideoReplyMutationIntent[];
};

export function buildMissingReplyTreeInventoryBlockedPlan(
  targetUserId: string
): StoryVideoReplyMutationPlan {
  return createBlockedReplyMutationPlan({
    targetUserId,
    blockCode: ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE,
    blockers: [
      {
        code: "REPLY_TREE_INVENTORY_BATCH_MISSING",
        reason:
          "Authoritative reply-tree inventory batch was not supplied — missing batch cannot prove zero target-associated replies.",
      },
    ],
  });
}

function createBlockedReplyMutationPlan(input: {
  targetUserId: string;
  blockCode: string;
  blockers: readonly ReplyTreeSafetyBlocker[];
  expectedReplyCount?: number;
}): StoryVideoReplyMutationPlan {
  return freezeStoryVideoReplyMutationPlan({
    targetUserId: input.targetUserId,
    ok: false,
    blockedExecution: true,
    blockCode: input.blockCode,
    blockers: input.blockers,
    expectedReplyCount: input.expectedReplyCount ?? 0,
    plannedReplyMutationCount: 0,
    mutationIntents: [],
  });
}

export function freezeStoryVideoReplyMutationPlan(
  plan: StoryVideoReplyMutationPlan
): StoryVideoReplyMutationPlan {
  Object.freeze(plan.blockers);
  Object.freeze(plan.mutationIntents);
  for (const intent of plan.mutationIntents) {
    Object.freeze(intent);
  }
  return Object.freeze(plan);
}

function planSingleReplyMutation(input: {
  inventory: ReplyTreeNodeInventory;
  targetUserId: string;
}): StoryVideoReplyMutationIntent | null {
  const { inventory, targetUserId } = input;
  const roles = inventory.targetParticipantRoles;

  if (roles.length === 0) {
    return null;
  }

  const isTargetSender = inventory.userId === targetUserId;
  const isTargetRecipient = inventory.recipientUserId === targetUserId;
  const isSelfReply = isTargetSender && isTargetRecipient;

  const base = {
    replyId: inventory.replyId,
    storyId: inventory.storyId,
    parentReplyId: inventory.parentReplyId,
    preserveParentReplyId: true as const,
    preserveStoryId: true as const,
  };

  if (isSelfReply) {
    return {
      ...base,
      action: "DETACH_TARGET_SELF_AND_TOMBSTONE",
      setUserIdNull: true,
      setRecipientUserIdNull: true,
      replaceMessageWithTombstone: true,
      messageReplacement: ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE,
      setDeletedBySenderTrue: true,
      setDeletedByRecipientTrue: true,
      reason:
        "Target self-reply — preserve row and tree link; detach both participant IDs and tombstone target-authored message.",
    };
  }

  if (isTargetSender && !isTargetRecipient) {
    return {
      ...base,
      action: "DETACH_TARGET_AUTHOR_AND_TOMBSTONE",
      setUserIdNull: true,
      setRecipientUserIdNull: false,
      replaceMessageWithTombstone: true,
      messageReplacement: ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE,
      setDeletedBySenderTrue: true,
      setDeletedByRecipientTrue: false,
      reason:
        "Target is sender — preserve row for surviving recipient; detach target user_id, tombstone message, set deleted_by_sender.",
    };
  }

  if (isTargetRecipient && !isTargetSender) {
    return {
      ...base,
      action: "DETACH_TARGET_RECIPIENT",
      setUserIdNull: false,
      setRecipientUserIdNull: true,
      replaceMessageWithTombstone: false,
      setDeletedBySenderTrue: false,
      setDeletedByRecipientTrue: true,
      reason:
        "Target is recipient — preserve surviving sender message byte-for-byte; detach target recipient_user_id, set deleted_by_recipient.",
    };
  }

  return null;
}

export function buildStoryVideoReplyMutationPlan(input: {
  batch: TargetReplyTreeInventoryBatch;
  manifestTargetUserId: string;
}): StoryVideoReplyMutationPlan {
  const validation = validateTargetReplyTreeInventoryBatchForPlanning({
    batch: input.batch,
    manifestTargetUserId: input.manifestTargetUserId,
  });

  const expectedReplyCount = input.batch.expectedTargetReplyIds.length;

  if (validation.ok === false) {
    return createBlockedReplyMutationPlan({
      targetUserId: input.manifestTargetUserId,
      blockCode: ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE,
      blockers: validation.blockers,
      expectedReplyCount,
    });
  }

  const inventoryById = new Map(
    input.batch.inventories.map((entry) => [entry.replyId, entry])
  );
  const mutationIntents: StoryVideoReplyMutationIntent[] = [];

  for (const replyId of input.batch.expectedTargetReplyIds) {
    const inventory = inventoryById.get(replyId);
    if (!inventory) {
      return createBlockedReplyMutationPlan({
        targetUserId: input.manifestTargetUserId,
        blockCode: ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE,
        blockers: [
          {
            code: "REPLY_PLAN_MISSING_INVENTORY",
            reason: `Missing inventory for expected target reply ${replyId}.`,
          },
        ],
        expectedReplyCount,
      });
    }

    const intent = planSingleReplyMutation({
      inventory,
      targetUserId: input.manifestTargetUserId,
    });

    if (!intent) {
      return createBlockedReplyMutationPlan({
        targetUserId: input.manifestTargetUserId,
        blockCode: ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE,
        blockers: [
          {
            code: "REPLY_PLAN_UNCLASSIFIED_TARGET_REPLY",
            reason: `Could not classify mutation for target-associated reply ${replyId}.`,
          },
        ],
        expectedReplyCount,
      });
    }

    mutationIntents.push(intent);
  }

  const invariant = validateStoryVideoReplyMutationPlanInvariants({
    targetUserId: input.manifestTargetUserId,
    mutationIntents,
    batch: input.batch,
  });

  if (invariant.ok === false) {
    return createBlockedReplyMutationPlan({
      targetUserId: input.manifestTargetUserId,
      blockCode: ACCOUNT_DELETION_REPLY_TREE_INVENTORY_NOT_AUTHORITATIVE_CODE,
      blockers: [{ code: "REPLY_PLAN_INVARIANT_VIOLATION", reason: invariant.reason }],
      expectedReplyCount,
    });
  }

  return freezeStoryVideoReplyMutationPlan({
    targetUserId: input.manifestTargetUserId,
    ok: true,
    blockedExecution: false,
    blockCode: null,
    blockers: [],
    expectedReplyCount,
    plannedReplyMutationCount: mutationIntents.length,
    mutationIntents,
  });
}

function validateIntentActionSemantics(input: {
  intent: StoryVideoReplyMutationIntent;
  inventory: ReplyTreeNodeInventory;
  targetUserId: string;
}): { ok: true } | { ok: false; reason: string } {
  const { intent, inventory, targetUserId } = input;
  const isTargetSender = inventory.userId === targetUserId;
  const isTargetRecipient = inventory.recipientUserId === targetUserId;
  const isSelfReply = isTargetSender && isTargetRecipient;
  const replyId = intent.replyId;

  if (isSelfReply) {
    if (intent.action !== "DETACH_TARGET_SELF_AND_TOMBSTONE") {
      return {
        ok: false,
        reason: `Reply ${replyId} self-reply must use DETACH_TARGET_SELF_AND_TOMBSTONE.`,
      };
    }
    if (
      !intent.setUserIdNull ||
      !intent.setRecipientUserIdNull ||
      !intent.replaceMessageWithTombstone ||
      intent.messageReplacement !== ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE ||
      !intent.setDeletedBySenderTrue ||
      !intent.setDeletedByRecipientTrue
    ) {
      return {
        ok: false,
        reason: `Reply ${replyId} self-reply intent has invalid field semantics.`,
      };
    }
    return { ok: true };
  }

  if (isTargetSender && !isTargetRecipient) {
    if (intent.action !== "DETACH_TARGET_AUTHOR_AND_TOMBSTONE") {
      return {
        ok: false,
        reason: `Reply ${replyId} target-author must use DETACH_TARGET_AUTHOR_AND_TOMBSTONE.`,
      };
    }
    if (
      inventory.recipientUserId == null ||
      inventory.recipientUserId === targetUserId
    ) {
      return {
        ok: false,
        reason: `Reply ${replyId} target-author case requires surviving non-target recipient.`,
      };
    }
    if (
      !intent.setUserIdNull ||
      intent.setRecipientUserIdNull ||
      !intent.replaceMessageWithTombstone ||
      intent.messageReplacement !== ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE ||
      !intent.setDeletedBySenderTrue ||
      intent.setDeletedByRecipientTrue
    ) {
      return {
        ok: false,
        reason: `Reply ${replyId} target-author intent has invalid field semantics.`,
      };
    }
    return { ok: true };
  }

  if (isTargetRecipient && !isTargetSender) {
    if (intent.action !== "DETACH_TARGET_RECIPIENT") {
      return {
        ok: false,
        reason: `Reply ${replyId} target-recipient must use DETACH_TARGET_RECIPIENT.`,
      };
    }
    if (inventory.userId == null || inventory.userId === targetUserId) {
      return {
        ok: false,
        reason: `Reply ${replyId} target-recipient case requires surviving non-target sender.`,
      };
    }
    if (
      intent.setUserIdNull ||
      !intent.setRecipientUserIdNull ||
      intent.replaceMessageWithTombstone ||
      intent.messageReplacement != null ||
      intent.setDeletedBySenderTrue ||
      !intent.setDeletedByRecipientTrue
    ) {
      return {
        ok: false,
        reason: `Reply ${replyId} target-recipient intent has invalid field semantics.`,
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Reply ${replyId} has unsupported participant classification for mutation planning.`,
  };
}

export function validateStoryVideoReplyMutationPlanInvariants(input: {
  targetUserId: string;
  mutationIntents: readonly StoryVideoReplyMutationIntent[];
  batch: TargetReplyTreeInventoryBatch;
}): { ok: true } | { ok: false; reason: string } {
  const expectedSet = new Set(input.batch.expectedTargetReplyIds);
  const plannedIds = input.mutationIntents.map((entry) => entry.replyId);

  if (plannedIds.length !== expectedSet.size) {
    return {
      ok: false,
      reason: "Planned reply mutation count must match expected target reply count exactly.",
    };
  }

  for (const replyId of plannedIds) {
    if (!expectedSet.has(replyId)) {
      return {
        ok: false,
        reason: `Unexpected reply mutation intent for non-target reply ${replyId}.`,
      };
    }
  }

  const inventoryById = new Map(
    input.batch.inventories.map((entry) => [entry.replyId, entry])
  );

  for (const intent of input.mutationIntents) {
    const inventory = inventoryById.get(intent.replyId);
    if (!inventory) {
      return {
        ok: false,
        reason: `Missing inventory for planned reply ${intent.replyId}.`,
      };
    }

    if (intent.preserveParentReplyId !== true || intent.preserveStoryId !== true) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must preserve parent_reply_id and story_id.`,
      };
    }

    if (intent.storyId !== inventory.storyId) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} storyId must match inventory storyId.`,
      };
    }

    if (intent.parentReplyId !== inventory.parentReplyId) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} parentReplyId must match inventory parentReplyId.`,
      };
    }

    const isTargetSender = inventory.userId === input.targetUserId;
    const isTargetRecipient = inventory.recipientUserId === input.targetUserId;

    if (intent.setUserIdNull && !isTargetSender) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not null surviving user_id.`,
      };
    }

    if (intent.setRecipientUserIdNull && !isTargetRecipient) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not null surviving recipient_user_id.`,
      };
    }

    if (!isTargetSender && intent.replaceMessageWithTombstone) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not tombstone surviving-authored message.`,
      };
    }

    if (intent.replaceMessageWithTombstone) {
      if (intent.messageReplacement !== ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE) {
        return {
          ok: false,
          reason: `Reply ${intent.replyId} tombstone must use server constant only.`,
        };
      }
    } else if (intent.messageReplacement != null) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not carry messageReplacement when not tombstoning.`,
      };
    }

    if (intent.setDeletedBySenderTrue && !isTargetSender) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not set deleted_by_sender for non-target sender.`,
      };
    }

    if (intent.setDeletedByRecipientTrue && !isTargetRecipient) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not set deleted_by_recipient for non-target recipient.`,
      };
    }

    if (!isTargetSender && intent.action.includes("TOMBSTONE")) {
      return {
        ok: false,
        reason: `Reply ${intent.replyId} must not use tombstone action for surviving-authored content.`,
      };
    }

    const actionSemantics = validateIntentActionSemantics({
      intent,
      inventory,
      targetUserId: input.targetUserId,
    });
    if (actionSemantics.ok === false) {
      return actionSemantics;
    }
  }

  return { ok: true };
}

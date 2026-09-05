/**
 * Story lifecycle classification and never-published deletion eligibility (Phase 4C.7B.1E.1D).
 * Pure planning helpers — no SQL execution.
 */

export type StoryLifecycle =
  | "LIVE_PUBLIC"
  | "PREVIOUSLY_PUBLIC_OR_REMOVED"
  | "NEVER_PUBLISHED"
  | "UNKNOWN";

export type StorySubstantiveChildPolicy =
  | "ANONYMIZE_AND_PRESERVE"
  | "DETACH_AND_PRESERVE"
  | "PRESERVE_AND_DETACH"
  | "DELETE_AS_DERIVED_ENGAGEMENT"
  | "BLOCK_UNRESOLVED";

export const STORY_SUBSTANTIVE_CHILD_POLICIES = {
  prayer_video_responses: "ANONYMIZE_AND_PRESERVE",
  prayer_written_responses: "ANONYMIZE_AND_PRESERVE",
  story_video_replies: "DETACH_AND_PRESERVE",
  content_reports: "PRESERVE_AND_DETACH",
  story_reactions: "DELETE_AS_DERIVED_ENGAGEMENT",
  prayer_follows: "DELETE_AS_DERIVED_ENGAGEMENT",
  saved_content: "DELETE_AS_DERIVED_ENGAGEMENT",
  prayer_updates: "ANONYMIZE_AND_PRESERVE",
} as const satisfies Record<string, StorySubstantiveChildPolicy>;

export type StoryDeletionChildInventory = {
  inventoryComplete: boolean;
  prayerVideoResponseCount: number;
  prayerWrittenResponseCount: number;
  storyVideoReplyCount: number;
  contentReportCount: number;
  prayerUpdateCount: number;
  reactionCount: number;
  followCount: number;
  savedContentCount: number;
  reportEvidencePreservedBeforeStoryDelete: boolean;
  thirdPartyPrayerVideoResponseCount: number;
  thirdPartyPrayerWrittenResponseCount: number;
  thirdPartyPrayerUpdateCount: number;
  crossUserStoryVideoReplyCount: number;
  ambiguousStoryVideoReplyCount: number;
  nullAuthorPrayerVideoResponseCount: number;
  nullAuthorPrayerWrittenResponseCount: number;
  nullAuthorPrayerUpdateCount: number;
  thirdPartyReactionCount: number;
  thirdPartySavedContentCount: number;
  thirdPartyFollowCount: number;
  nullOwnerReactionCount: number;
  nullOwnerSavedContentCount: number;
  nullOwnerFollowCount: number;
};

export type StoryAuthorClassificationCounts = {
  total: number;
  targetAuthored: number;
  thirdPartyAuthored: number;
  nullAuthor: number;
  querySucceeded: boolean;
};

export type StoryVideoReplyClassificationCounts = {
  total: number;
  targetOnly: number;
  crossUser: number;
  ambiguousParticipant: number;
  querySucceeded: boolean;
};

export type StoryEngagementClassificationCounts = {
  total: number;
  targetOwned: number;
  thirdPartyOwned: number;
  nullOwner: number;
  querySucceeded: boolean;
};

export type StoryDeletionDependencyInventory = {
  prayerVideoResponses: StoryAuthorClassificationCounts;
  prayerWrittenResponses: StoryAuthorClassificationCounts;
  prayerUpdates: StoryAuthorClassificationCounts;
  storyVideoReplies: StoryVideoReplyClassificationCounts;
  contentReports: { total: number; querySucceeded: boolean };
  storyReactions: StoryEngagementClassificationCounts;
  savedContent: StoryEngagementClassificationCounts;
  prayerFollows: StoryEngagementClassificationCounts;
};

export type StoryDeletionSafetyBlocker = {
  code: string;
  reason: string;
};

export type StoryDeletionSafetyInventory = {
  storyId: string;
  targetUserId: string;
  ownershipVerified: boolean;
  status: string | null;
  removedAt: string | null;
  lifecycle: StoryLifecycle;
  queriesComplete: boolean;
  blockers: readonly StoryDeletionSafetyBlocker[];
  dependencies: StoryDeletionDependencyInventory;
  fingerprint: string;
  childInventory: StoryDeletionChildInventory;
};

export type StoryRowLifecycleInput = {
  storyId: string;
  status: string | null;
  removedAt: string | null;
  targetUserId: string;
  childInventory: StoryDeletionChildInventory;
};

export type NeverPublishedStoryDeletionEligibility =
  | { eligible: true }
  | { eligible: false; blockCode: string; reason: string };

export type StoryDeletionPlanAction =
  | "ANONYMIZE"
  | "ANONYMIZE_TOMBSTONE"
  | "HARD_DELETE"
  | "BLOCK_UNRESOLVED";

export type StoryDeletionPlanDecision = {
  storyId: string;
  lifecycle: StoryLifecycle;
  action: StoryDeletionPlanAction;
  reason: string;
  eligibility?: NeverPublishedStoryDeletionEligibility;
};

export const NEVER_PUBLISHED_STORY_STATUSES = ["pending", "submitted"] as const;

export const STORY_LIFECYCLE_STORAGE_NOTES = {
  LIVE_PUBLIC: "Story media remains PRESERVE_PUBLIC per Phase 1D bucket policy.",
  PREVIOUSLY_PUBLIC_OR_REMOVED:
    "Tombstone story retains parent row — attached public media remains PRESERVE_PUBLIC.",
  NEVER_PUBLISHED_HARD_DELETE:
    "Verified never-published HARD_DELETE requires future draft-media cleanup coordinated with 1D — do not reclassify global story buckets to DELETE_PRIVATE.",
} as const;

export type LoadStoryDeletionSafetyInventoryDeps = {
  loadStoryDeletionSafetyInventory: (
    storyId: string,
    targetUserId: string
  ) => Promise<StoryDeletionSafetyInventory>;
};

export function emptyStoryDeletionChildInventory(): StoryDeletionChildInventory {
  return {
    inventoryComplete: false,
    prayerVideoResponseCount: 0,
    prayerWrittenResponseCount: 0,
    storyVideoReplyCount: 0,
    contentReportCount: 0,
    prayerUpdateCount: 0,
    reactionCount: 0,
    followCount: 0,
    savedContentCount: 0,
    reportEvidencePreservedBeforeStoryDelete: false,
    thirdPartyPrayerVideoResponseCount: 0,
    thirdPartyPrayerWrittenResponseCount: 0,
    thirdPartyPrayerUpdateCount: 0,
    crossUserStoryVideoReplyCount: 0,
    ambiguousStoryVideoReplyCount: 0,
    nullAuthorPrayerVideoResponseCount: 0,
    nullAuthorPrayerWrittenResponseCount: 0,
    nullAuthorPrayerUpdateCount: 0,
    thirdPartyReactionCount: 0,
    thirdPartySavedContentCount: 0,
    thirdPartyFollowCount: 0,
    nullOwnerReactionCount: 0,
    nullOwnerSavedContentCount: 0,
    nullOwnerFollowCount: 0,
  };
}

export function classifyStoryLifecycle(input: {
  status: string | null;
  removedAt: string | null;
}): StoryLifecycle {
  const status = (input.status ?? "").toLowerCase();
  const removedAt = input.removedAt;

  if (status === "removed" || removedAt != null) {
    return "PREVIOUSLY_PUBLIC_OR_REMOVED";
  }

  if (status === "approved") {
    return "LIVE_PUBLIC";
  }

  if (
    (NEVER_PUBLISHED_STORY_STATUSES as readonly string[]).includes(status) &&
    removedAt == null
  ) {
    return "NEVER_PUBLISHED";
  }

  return "UNKNOWN";
}

export function evaluateNeverPublishedStoryDeletionEligibility(input: {
  lifecycle: StoryLifecycle;
  childInventory: StoryDeletionChildInventory;
}): NeverPublishedStoryDeletionEligibility {
  const { lifecycle, childInventory } = input;

  if (lifecycle !== "NEVER_PUBLISHED") {
    return {
      eligible: false,
      blockCode: "STORY_NOT_NEVER_PUBLISHED",
      reason: "HARD_DELETE eligibility applies only to verified never-published stories.",
    };
  }

  if (!childInventory.inventoryComplete) {
    return {
      eligible: false,
      blockCode: "STORY_CHILD_INVENTORY_INCOMPLETE",
      reason: "Never-published story child inventory is incomplete — cannot plan HARD_DELETE.",
    };
  }

  if (childInventory.prayerVideoResponseCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_SUBSTANTIVE_CHILD",
      reason:
        "Never-published story has prayer_video_responses — substantive child blocks parent HARD_DELETE.",
    };
  }

  if (childInventory.nullAuthorPrayerVideoResponseCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_AMBIGUOUS_CHILD",
      reason:
        "Never-published story has prayer_video_responses with NULL author — cannot authorize HARD_DELETE.",
    };
  }

  if (childInventory.prayerWrittenResponseCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_SUBSTANTIVE_CHILD",
      reason:
        "Never-published story has prayer_written_responses — substantive child blocks parent HARD_DELETE.",
    };
  }

  if (childInventory.nullAuthorPrayerWrittenResponseCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_AMBIGUOUS_CHILD",
      reason:
        "Never-published story has prayer_written_responses with NULL author — cannot authorize HARD_DELETE.",
    };
  }

  if (childInventory.prayerUpdateCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_SUBSTANTIVE_CHILD",
      reason:
        "Never-published story has prayer_updates — ANONYMIZE_AND_PRESERVE policy blocks parent HARD_DELETE (including indirect inbox cascade risk).",
    };
  }

  if (childInventory.storyVideoReplyCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_STORY_VIDEO_REPLY",
      reason:
        "Never-published story has story_video_replies — cross-user private reply risk blocks HARD_DELETE.",
    };
  }

  if (childInventory.crossUserStoryVideoReplyCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_CROSS_USER_REPLY",
      reason:
        "Never-published story has cross-user story_video_replies — surviving party preservation blocks HARD_DELETE.",
    };
  }

  if (childInventory.ambiguousStoryVideoReplyCount > 0) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_AMBIGUOUS_CHILD",
      reason:
        "Never-published story has story_video_replies with NULL participant — cannot authorize HARD_DELETE.",
    };
  }

  if (
    childInventory.thirdPartyReactionCount > 0 ||
    childInventory.thirdPartySavedContentCount > 0 ||
    childInventory.thirdPartyFollowCount > 0
  ) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_THIRD_PARTY_ENGAGEMENT",
      reason:
        "Never-published story has third-party engagement rows — cannot assume disposable engagement on HARD_DELETE.",
    };
  }

  if (
    childInventory.nullOwnerReactionCount > 0 ||
    childInventory.nullOwnerSavedContentCount > 0 ||
    childInventory.nullOwnerFollowCount > 0
  ) {
    return {
      eligible: false,
      blockCode: "STORY_HAS_AMBIGUOUS_ENGAGEMENT",
      reason:
        "Never-published story has engagement rows with NULL owner — cannot authorize HARD_DELETE.",
    };
  }

  if (
    childInventory.contentReportCount > 0 &&
    !childInventory.reportEvidencePreservedBeforeStoryDelete
  ) {
    return {
      eligible: false,
      blockCode: "STORY_REPORT_EVIDENCE_UNPRESERVED",
      reason:
        "Never-published story has content_reports without proven evidence preservation — BLOCK until snapshot/detach policy satisfied.",
    };
  }

  return { eligible: true };
}

export function planStoryDeletionDecision(
  input: StoryRowLifecycleInput
): StoryDeletionPlanDecision {
  const lifecycle = classifyStoryLifecycle({
    status: input.status,
    removedAt: input.removedAt,
  });

  switch (lifecycle) {
    case "LIVE_PUBLIC":
      return {
        storyId: input.storyId,
        lifecycle,
        action: "ANONYMIZE",
        reason:
          "Live public story — strip owner identity; preserve testimony and attached substantive child content.",
      };
    case "PREVIOUSLY_PUBLIC_OR_REMOVED":
      return {
        storyId: input.storyId,
        lifecycle,
        action: "ANONYMIZE_TOMBSTONE",
        reason:
          "Previously public or removed story — tombstone anonymization preserves parent row so cross-user prayer responses and replies are not cascade-deleted.",
      };
    case "NEVER_PUBLISHED": {
      const eligibility = evaluateNeverPublishedStoryDeletionEligibility({
        lifecycle,
        childInventory: input.childInventory,
      });
      if (eligibility.eligible === false) {
        return {
          storyId: input.storyId,
          lifecycle,
          action: "BLOCK_UNRESOLVED",
          reason: eligibility.reason,
          eligibility,
        };
      }
      return {
        storyId: input.storyId,
        lifecycle,
        action: "HARD_DELETE",
        reason:
          "Verified never-published story with complete child inventory and no substantive third-party rows — eligible for HARD_DELETE planning only.",
        eligibility,
      };
    }
    default:
      return {
        storyId: input.storyId,
        lifecycle: "UNKNOWN",
        action: "BLOCK_UNRESOLVED",
        reason: "Unexpected story status/state — do not infer private; fail closed.",
      };
  }
}

export function hasSubstantiveStoryChildInventory(
  inventory: StoryDeletionChildInventory
): boolean {
  return (
    inventory.prayerVideoResponseCount > 0 ||
    inventory.prayerWrittenResponseCount > 0 ||
    inventory.storyVideoReplyCount > 0
  );
}

export function isRemovedOrTombstoneStoryHardDelete(entry: {
  table: string;
  selector: string;
}): boolean {
  if (entry.table !== "stories") {
    return false;
  }

  return (
    entry.selector.includes("lifecycle = PREVIOUSLY_PUBLIC_OR_REMOVED") ||
    entry.selector.includes("tombstone") ||
    entry.selector.includes("status = 'removed'") ||
    entry.selector.includes("removed_at IS NOT NULL")
  );
}

export function storySafetyInventoryToPlanningInput(
  inventory: StoryDeletionSafetyInventory
): StoryRowLifecycleInput {
  return {
    storyId: inventory.storyId,
    status: inventory.status,
    removedAt: inventory.removedAt,
    targetUserId: inventory.targetUserId,
    childInventory: inventory.childInventory,
  };
}

export function buildStoryPlanningInputsFromSafetyInventories(
  inventories: readonly StoryDeletionSafetyInventory[]
): StoryRowLifecycleInput[] {
  return inventories.map(storySafetyInventoryToPlanningInput);
}

export const ACCOUNT_DELETION_STORY_CROSS_USER_INVARIANT =
  "Deleting Account A must not HARD_DELETE substantive content authored by surviving Account B solely because that content references Account A's story." as const;

export const ACCOUNT_DELETION_STORY_SAFETY_INVARIANTS = [
  ACCOUNT_DELETION_STORY_CROSS_USER_INVARIANT,
  "Incomplete story dependency inventory cannot authorize NEVER_PUBLISHED HARD_DELETE.",
  "NULL or ambiguous child authorship cannot be treated as target-owned.",
  "content_reports referencing a story require explicit detach — reports must not silently disappear via cascade.",
  "Third-party substantive children block parent HARD_DELETE even when aggregate target-owned counts are zero.",
  "Any prayer_updates row blocks NEVER_PUBLISHED parent HARD_DELETE — ANONYMIZE_AND_PRESERVE applies regardless of author.",
  "Authoritative story safety inventory batch must cover every expected target-owned story before HARD_DELETE planning.",
] as const;

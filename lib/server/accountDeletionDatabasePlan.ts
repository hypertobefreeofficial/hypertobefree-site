import type { AccountDeletionManifest } from "./accountDeletionManifest";
import { BLOCKED_OWNER_ACCOUNT_CODE } from "./accountDeletionPolicy";
import type { AccountDeletionSchemaProbeResult } from "./accountDeletionSchemaProbe";
import {
  ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
  assertDatabaseActionDoesNotEscalate,
  classifyDatabaseTablePolicy,
  DELETED_PUBLIC_AUTHOR_DISPLAY_NAME,
  getSchemaExecutionBlockers,
  getUnsafeAuthDeleteCascadeBlockers,
  getDatabaseMutationOrderHints,
  isApprovedPublicStoryHardDelete,
  isKnownAccountDeletionDatabaseTable,
  isPublicTestimonyTable,
  resolveCombinedSchemaExecutionReady,
  PROFILE_ANONYMIZATION_IDENTITY_FIELDS,
  PUBLIC_TESTIMONY_TABLES,
  resolveMostRestrictiveDatabaseAction,
  STORY_ANONYMIZATION_IDENTITY_FIELDS,
  type AccountDeletionDatabaseAction,
  type AccountDeletionDatabaseTablePolicy,
  type AccountDeletionSchemaPrerequisite,
} from "./accountDeletionDatabasePolicy";
import {
  isRemovedOrTombstoneStoryHardDelete,
  planStoryDeletionDecision,
  STORY_LIFECYCLE_STORAGE_NOTES,
  type StoryRowLifecycleInput,
} from "./accountDeletionStoryLifecycle";
import type { AccountDeletionStoragePlan } from "./accountDeletionStoragePlan";
import { assertManifestStoragePlanContract } from "./accountDeletionStoragePlan";

export type AccountDeletionDatabasePlanEntry = {
  table: string;
  action: AccountDeletionDatabaseAction;
  selector: string;
  estimatedCount: number | null;
  reason: string;
  orderHint: number;
  identityFields: readonly string[];
  dependencyNotes: readonly string[];
};

export const ACCOUNT_DELETION_SCHEMA_NOT_READY_CODE =
  "SCHEMA_NOT_READY" as const;

export type AccountDeletionDatabasePlan = {
  targetUserId: string;
  requestId: string | null;
  hardDelete: AccountDeletionDatabasePlanEntry[];
  anonymize: AccountDeletionDatabasePlanEntry[];
  preserve: AccountDeletionDatabasePlanEntry[];
  detach: AccountDeletionDatabasePlanEntry[];
  blocked: AccountDeletionDatabasePlanEntry[];
  warnings: string[];
  blockedExecution: boolean;
  blockCode: string | null;
  schemaExecutionReady: boolean;
  schemaBlockers: readonly string[];
  schemaPrerequisites: readonly AccountDeletionSchemaPrerequisite[];
  profileAvatarReferencesWillBeCleared: boolean;
  authDeleteRequiresPriorAnonymization: boolean;
  mutationOrder: readonly string[];
  invariants: readonly string[];
};

export type AccountDeletionDatabasePlanBuildInput = {
  manifest: AccountDeletionManifest;
  /** Server-derived per-story lifecycle inputs — never accept from browser/HTTP body. */
  storyPlanningInputs?: readonly StoryRowLifecycleInput[];
  /** Optional live catalog probe — never accept from browser/HTTP body. */
  liveSchemaProbe?: AccountDeletionSchemaProbeResult | null;
};

type ManifestCountSource = {
  tableKey: string;
  count: number | null;
};

function manifestDatabaseCounts(
  manifest: AccountDeletionManifest
): ManifestCountSource[] {
  const all = [
    ...manifest.database.hardDelete,
    ...manifest.database.anonymize,
    ...manifest.database.preserve,
    ...manifest.database.manualReview,
  ];

  return all.map((row) => ({
    tableKey: row.table,
    count: row.count,
  }));
}

function estimateCountForSelector(input: {
  manifest: AccountDeletionManifest;
  policy: AccountDeletionDatabaseTablePolicy;
}): number | null {
  const { manifest, policy } = input;

  if (policy.table === "inbox_messages") {
    if (policy.selector.startsWith("user_id = targetUserId")) {
      return manifest.journey.recipientOwnedRows.count;
    }
    if (policy.selector.includes("sender_user_id = targetUserId")) {
      return manifest.journey.sentToOtherUserRows.count;
    }
  }

  if (policy.table === "profiles") {
    return manifest.identity.authUserExists === false ? 0 : 1;
  }

  if (policy.table === "account_deletion_requests") {
    return 1;
  }

  const manifestCount = manifestDatabaseCounts(manifest).find(
    (row) => row.tableKey === policy.table
  );
  return manifestCount?.count ?? null;
}

function buildEntryFromPolicy(input: {
  manifest: AccountDeletionManifest;
  policy: AccountDeletionDatabaseTablePolicy;
  actionOverride?: AccountDeletionDatabaseAction;
  reasonOverride?: string;
}): AccountDeletionDatabasePlanEntry {
  const action = input.actionOverride ?? input.policy.action;

  return {
    table: input.policy.table,
    action,
    selector: input.policy.selector,
    estimatedCount: estimateCountForSelector({
      manifest: input.manifest,
      policy: input.policy,
    }),
    reason: input.reasonOverride ?? input.policy.reason,
    orderHint: input.policy.orderHint,
    identityFields: input.policy.identityFields ?? [],
    dependencyNotes: [
      ...(input.policy.fkNotes ?? []),
      ...(input.policy.rlsNotes ?? []),
    ],
  };
}

function pushEntry(
  plan: AccountDeletionDatabasePlan,
  entry: AccountDeletionDatabasePlanEntry
) {
  switch (entry.action) {
    case "HARD_DELETE":
      plan.hardDelete.push(entry);
      break;
    case "ANONYMIZE":
      plan.anonymize.push(entry);
      break;
    case "PRESERVE":
      plan.preserve.push(entry);
      break;
    case "DETACH":
      plan.detach.push(entry);
      break;
    case "BLOCK_UNRESOLVED":
      plan.blocked.push(entry);
      break;
    default:
      plan.blocked.push(entry);
  }
}

function buildStoryDeletionPlanEntries(input: {
  manifest: AccountDeletionManifest;
  storyPlanningInputs?: readonly StoryRowLifecycleInput[];
}): AccountDeletionDatabasePlanEntry[] {
  const entries: AccountDeletionDatabasePlanEntry[] = [];
  const livePublicPolicy = classifyDatabaseTablePolicy("stories").find((policy) =>
    policy.selector.includes("status = 'approved'")
  );
  const tombstonePolicy = classifyDatabaseTablePolicy("stories").find((policy) =>
    policy.selector.includes("PREVIOUSLY_PUBLIC_OR_REMOVED")
  );

  for (const storyInput of input.storyPlanningInputs ?? []) {
    const decision = planStoryDeletionDecision(storyInput);

    switch (decision.action) {
      case "ANONYMIZE":
        entries.push({
          table: "stories",
          action: "ANONYMIZE",
          selector: `storyId = ${decision.storyId} AND lifecycle = LIVE_PUBLIC`,
          estimatedCount: 1,
          reason: decision.reason,
          orderHint: livePublicPolicy?.orderHint ?? 200,
          identityFields: STORY_ANONYMIZATION_IDENTITY_FIELDS,
          dependencyNotes: [
            ...(livePublicPolicy?.fkNotes ?? []),
            STORY_LIFECYCLE_STORAGE_NOTES.LIVE_PUBLIC,
          ],
        });
        break;
      case "ANONYMIZE_TOMBSTONE":
        entries.push({
          table: "stories",
          action: "ANONYMIZE",
          selector: `storyId = ${decision.storyId} AND lifecycle = PREVIOUSLY_PUBLIC_OR_REMOVED (tombstone)`,
          estimatedCount: 1,
          reason: decision.reason,
          orderHint: tombstonePolicy?.orderHint ?? 195,
          identityFields: STORY_ANONYMIZATION_IDENTITY_FIELDS,
          dependencyNotes: [
            ...(tombstonePolicy?.fkNotes ?? []),
            STORY_LIFECYCLE_STORAGE_NOTES.PREVIOUSLY_PUBLIC_OR_REMOVED,
          ],
        });
        break;
      case "HARD_DELETE":
        entries.push({
          table: "stories",
          action: "HARD_DELETE",
          selector: `storyId = ${decision.storyId} AND lifecycle = NEVER_PUBLISHED AND childInventoryEligible = true`,
          estimatedCount: 1,
          reason: decision.reason,
          orderHint: 190,
          identityFields: [],
          dependencyNotes: [STORY_LIFECYCLE_STORAGE_NOTES.NEVER_PUBLISHED_HARD_DELETE],
        });
        break;
      case "BLOCK_UNRESOLVED":
        entries.push({
          table: "stories",
          action: "BLOCK_UNRESOLVED",
          selector: `storyId = ${decision.storyId} AND lifecycle = ${decision.lifecycle}`,
          estimatedCount: 1,
          reason: decision.reason,
          orderHint: 0,
          identityFields: [],
          dependencyNotes:
            decision.eligibility?.eligible === false
              ? [decision.eligibility.reason]
              : [],
        });
        break;
      default:
        break;
    }
  }

  if ((input.storyPlanningInputs ?? []).length === 0) {
    const manifestStoryCount =
      input.manifest.publicContent.stories.length ||
      input.manifest.database.anonymize.find((row) => row.table === "stories")?.count ||
      0;

    if (livePublicPolicy && manifestStoryCount > 0) {
      entries.push({
        table: "stories",
        action: "ANONYMIZE",
        selector: livePublicPolicy.selector,
        estimatedCount: manifestStoryCount,
        reason: `${livePublicPolicy.reason} (aggregate — per-story lifecycle inventory required for tombstone/never-published planning).`,
        orderHint: livePublicPolicy.orderHint,
        identityFields: livePublicPolicy.identityFields ?? [],
        dependencyNotes: [
          ...(livePublicPolicy.fkNotes ?? []),
          "Per-story server inventory (loadStoryDeletionSafetyInventory) required before never-published HARD_DELETE planning.",
        ],
      });
    }
  }

  return entries;
}

export function buildAccountDeletionDatabasePlan(
  input: AccountDeletionDatabasePlanBuildInput
): AccountDeletionDatabasePlan {
  const { manifest, storyPlanningInputs } = input;
  const schemaReadiness = resolveCombinedSchemaExecutionReady({
    liveProbe: input.liveSchemaProbe,
  });
  const schemaExecutionReady = schemaReadiness.combinedReady;
  const schemaBlockers = getSchemaExecutionBlockers();

  const plan: AccountDeletionDatabasePlan = {
    targetUserId: manifest.identity.targetUserId,
    requestId: manifest.identity.requestId,
    hardDelete: [],
    anonymize: [],
    preserve: [],
    detach: [],
    blocked: [],
    warnings: [...manifest.warnings],
    blockedExecution: manifest.blocked,
    blockCode: manifest.blockCode,
    schemaExecutionReady,
    schemaBlockers,
    schemaPrerequisites: ACCOUNT_DELETION_SCHEMA_PREREQUISITES,
    profileAvatarReferencesWillBeCleared: false,
    authDeleteRequiresPriorAnonymization: true,
    mutationOrder: getDatabaseMutationOrderHints(),
    invariants: ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  };

  if (!schemaExecutionReady) {
    plan.blocked.push({
      table: "schema",
      action: "BLOCK_UNRESOLVED",
      selector: "schema prerequisites unsatisfied",
      estimatedCount: schemaBlockers.length,
      reason:
        "Required schema hardening migrations are not applied — destructive database execution must remain blocked.",
      orderHint: 0,
      identityFields: [],
      dependencyNotes: schemaBlockers,
    });
    plan.blockedExecution = true;
    plan.blockCode = plan.blockCode ?? ACCOUNT_DELETION_SCHEMA_NOT_READY_CODE;
    for (const blocker of schemaBlockers) {
      plan.warnings.push(`Schema blocker: ${blocker}`);
    }
  }

  if (manifest.blocked || manifest.blockCode === BLOCKED_OWNER_ACCOUNT_CODE) {
    plan.warnings.push(
      "Privileged target account is blocked from permanent deletion planning execution."
    );
  }

  if (!manifest.journey.journeyReferenceInventoryComplete) {
    plan.blocked.push({
      table: "inbox_messages",
      action: "BLOCK_UNRESOLVED",
      selector: "journey media inventory incomplete",
      estimatedCount: manifest.journey.unresolvedJourneyReferenceCount,
      reason:
        "Journey inbox media reference inventory is incomplete — database/storage plans must fail closed together.",
      orderHint: 0,
      identityFields: [],
      dependencyNotes: [],
    });
    plan.blockedExecution = true;
  }

  for (const policy of classifyDatabaseTablePolicy("profiles")) {
    pushEntry(plan, buildEntryFromPolicy({ manifest, policy }));
  }

  for (const storyEntry of buildStoryDeletionPlanEntries({
    manifest,
    storyPlanningInputs,
  })) {
    pushEntry(plan, storyEntry);
  }

  for (const table of [
    "prayer_video_responses",
    "prayer_written_responses",
    "prayer_updates",
    "inbox_messages",
    "story_reactions",
    "story_video_replies",
    "saved_content",
    "prayer_follows",
    "prayer_search_preferences",
    "blocked_users",
    "content_reports",
    "admin_action_logs",
    "account_deletion_requests",
  ] as const) {
    for (const policy of classifyDatabaseTablePolicy(table)) {
      pushEntry(plan, buildEntryFromPolicy({ manifest, policy }));
    }
  }

  plan.profileAvatarReferencesWillBeCleared = plan.hardDelete.some(
    (entry) =>
      entry.table === "profiles" &&
      entry.identityFields.includes("avatar_url")
  );

  for (const blocker of getUnsafeAuthDeleteCascadeBlockers()) {
    plan.warnings.push(blocker);
  }

  if (
    plan.anonymize.some((entry) =>
      ["prayer_video_responses", "prayer_written_responses", "prayer_updates"].includes(
        entry.table
      )
    )
  ) {
    plan.authDeleteRequiresPriorAnonymization = true;
  }

  return plan;
}

export function validateDatabasePlanInvariants(
  plan: AccountDeletionDatabasePlan
): { ok: true } | { ok: false; reason: string } {
  for (const table of PUBLIC_TESTIMONY_TABLES) {
    if (table === "stories") {
      const approvedStoryHardDelete = plan.hardDelete.filter(isApprovedPublicStoryHardDelete);
      if (approvedStoryHardDelete.length > 0) {
        return {
          ok: false,
          reason: "Approved public stories cannot be HARD_DELETE.",
        };
      }

      const tombstoneHardDelete = plan.hardDelete.filter(isRemovedOrTombstoneStoryHardDelete);
      if (tombstoneHardDelete.length > 0) {
        return {
          ok: false,
          reason:
            "Previously public or removed stories cannot be HARD_DELETE — tombstone ANONYMIZE only.",
        };
      }

      const blockedStoryHardDelete = plan.hardDelete.filter(
        (entry) =>
          entry.table === "stories" &&
          !entry.selector.includes("lifecycle = NEVER_PUBLISHED")
      );
      if (blockedStoryHardDelete.length > 0) {
        return {
          ok: false,
          reason:
            "Story HARD_DELETE entries must declare NEVER_PUBLISHED lifecycle eligibility.",
        };
      }

      continue;
    }

    if (!isPublicTestimonyTable(table)) {
      continue;
    }

    const hardDeletePublic = plan.hardDelete.filter((entry) => entry.table === table);
    if (hardDeletePublic.length > 0) {
      return {
        ok: false,
        reason: `Public testimony table ${table} cannot be HARD_DELETE.`,
      };
    }
  }

  const survivingJourneyHardDelete = plan.hardDelete.filter(
    (entry) =>
      entry.table === "inbox_messages" &&
      entry.selector.includes("sender_user_id = targetUserId")
  );
  if (survivingJourneyHardDelete.length > 0) {
    return {
      ok: false,
      reason: "Surviving other-user Journey inbox rows cannot be HARD_DELETE.",
    };
  }

  const auditHardDelete = plan.hardDelete.filter((entry) =>
    ["admin_action_logs", "account_deletion_requests"].includes(entry.table)
  );
  if (auditHardDelete.length > 0) {
    return {
      ok: false,
      reason: "Audit/deletion request rows cannot be HARD_DELETE.",
    };
  }

  for (const entry of plan.hardDelete) {
    const registry = classifyDatabaseTablePolicy(entry.table);
    for (const policy of registry) {
      if (policy.selector !== entry.selector) {
        continue;
      }
      const escalation = assertDatabaseActionDoesNotEscalate({
        from: policy.action,
        to: entry.action,
      });
      if (escalation.ok === false) {
        return escalation;
      }
    }
  }

  if (!plan.schemaExecutionReady && plan.hardDelete.length > 0 && !plan.blockedExecution) {
    return {
      ok: false,
      reason:
        "Destructive hard-delete entries require schemaExecutionReady or blockedExecution gate.",
    };
  }

  return { ok: true };
}

export function assertDestructiveExecutionAllowed(
  plan: AccountDeletionDatabasePlan
): { ok: true } | { ok: false; reason: string; code: string } {
  if (plan.blockedExecution) {
    return {
      ok: false,
      reason: "Database plan execution is blocked.",
      code: plan.blockCode ?? "BLOCKED",
    };
  }

  if (!plan.schemaExecutionReady) {
    return {
      ok: false,
      reason: "Schema prerequisites are not satisfied for destructive execution.",
      code: ACCOUNT_DELETION_SCHEMA_NOT_READY_CODE,
    };
  }

  return { ok: true };
}

export function assertDatabaseStoragePlanContract(input: {
  manifest: AccountDeletionManifest;
  databasePlan: AccountDeletionDatabasePlan;
  storagePlan: AccountDeletionStoragePlan;
}): { ok: true } | { ok: false; reason: string } {
  const storageContract = assertManifestStoragePlanContract(
    input.manifest,
    input.storagePlan
  );
  if (storageContract.ok === false) {
    return storageContract;
  }

  if (
    input.databasePlan.blockedExecution !== input.storagePlan.journeyInventoryBlocked &&
    input.manifest.journey.unresolvedJourneyReferenceCount > 0
  ) {
    return {
      ok: false,
      reason:
        "Database and storage plans disagree on Journey reference inventory blocking.",
    };
  }

  for (const preserved of input.storagePlan.preserveShared) {
    const matchingDetach = input.databasePlan.detach.some(
      (entry) =>
        entry.table === "inbox_messages" &&
        entry.selector.includes("sender_user_id = targetUserId")
    );
    if (!matchingDetach) {
      return {
        ok: false,
        reason:
          "Storage PRESERVE_SHARED Journey media requires matching inbox_messages DETACH policy.",
      };
    }
  }

  if (
    input.storagePlan.delete.some((entry) => entry.bucket === "profile-avatars") &&
    !input.databasePlan.profileAvatarReferencesWillBeCleared
  ) {
    return {
      ok: false,
      reason:
        "Storage avatar deletion requires database plan to clear profile avatar references.",
    };
  }

  for (const deleteEntry of input.storagePlan.delete) {
    if (deleteEntry.bucket !== "journey-private-media") {
      continue;
    }

    const hardDeleteRecipientOwned = input.databasePlan.hardDelete.some(
      (entry) =>
        entry.table === "inbox_messages" &&
        entry.selector.startsWith("user_id = targetUserId")
    );
    if (!hardDeleteRecipientOwned) {
      return {
        ok: false,
        reason:
          "Journey private storage deletion requires recipient-owned inbox hard-delete policy.",
      };
    }
  }

  return { ok: true };
}

export function summarizeAccountDeletionDatabasePlan(
  plan: AccountDeletionDatabasePlan
) {
  return {
    targetUserId: plan.targetUserId,
    requestId: plan.requestId,
    hardDeleteCount: plan.hardDelete.length,
    anonymizeCount: plan.anonymize.length,
    preserveCount: plan.preserve.length,
    detachCount: plan.detach.length,
    blockedCount: plan.blocked.length,
    warningCount: plan.warnings.length,
    blockedExecution: plan.blockedExecution,
    schemaExecutionReady: plan.schemaExecutionReady,
    schemaBlockerCount: plan.schemaBlockers.length,
    profileAvatarReferencesWillBeCleared: plan.profileAvatarReferencesWillBeCleared,
  };
}

export function getAnonymizedStoryIdentityPatch(): Record<string, null | string> {
  return Object.fromEntries([
    ...STORY_ANONYMIZATION_IDENTITY_FIELDS.map((field) => [field, null]),
    ["name", DELETED_PUBLIC_AUTHOR_DISPLAY_NAME],
  ]);
}

export function getProfileIdentityClearingPatch(): Record<string, null> {
  return Object.fromEntries(
    PROFILE_ANONYMIZATION_IDENTITY_FIELDS.map((field) => [field, null])
  );
}

export function rejectBrowserSuppliedDatabasePlanTargets(body: Record<string, unknown>) {
  const forbidden = [
    "targetUserId",
    "target_user_id",
    "userId",
    "user_id",
    "sql",
    "tables",
    "rows",
    "hardDelete",
    "anonymize",
  ];

  return forbidden.some((key) => key in body);
}

export function resolveDatabaseAndStorageActions(
  databaseAction: AccountDeletionDatabaseAction,
  storageClassification?: string
): AccountDeletionDatabaseAction {
  if (!storageClassification) {
    return databaseAction;
  }

  if (storageClassification === "PRESERVE_SHARED" && databaseAction === "HARD_DELETE") {
    return "BLOCK_UNRESOLVED";
  }

  if (storageClassification === "DELETE_PRIVATE" && databaseAction === "PRESERVE") {
    return "BLOCK_UNRESOLVED";
  }

  return resolveMostRestrictiveDatabaseAction(databaseAction, "PRESERVE");
}

export const ACCOUNT_DELETION_DATABASE_FAILURE_RECOVERY_NOTES = [
  "Stages before auth.users delete must be idempotent: anonymize/detach/hard-delete can be retried when keyed by targetUserId selectors.",
  "If public content anonymized but private hard-delete incomplete, request stays deletion_in_progress with failure_metadata describing last successful stage.",
  "If storage cleanup fails after DB references cleared, do not delete auth.users; retry storage only after re-verifying avatar/Journey reference state.",
  "If auth.users delete fails after DB cleanup, retry auth delete only — do not repeat destructive DB stages unless verification shows partial state.",
  "account_deletion_requests.failure_code and failure_metadata must record stage, counts, and non-PII fingerprints for operator recovery.",
] as const;

export function classifyUnknownDatabaseTable(table: string): AccountDeletionDatabaseAction {
  return isKnownAccountDeletionDatabaseTable(table)
    ? "BLOCK_UNRESOLVED"
    : "BLOCK_UNRESOLVED";
}

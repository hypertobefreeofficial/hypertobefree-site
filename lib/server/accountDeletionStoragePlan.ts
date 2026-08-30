import type { AccountDeletionManifest, ManifestStorageObject } from "./accountDeletionManifest";
import { storageObjectKey } from "./accountDeletionStorageKeys";
import {
  assertDeleteClassificationConsistent,
  assertManifestPlanContract,
  classifyAccountDeletionStorageObject,
  JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_CODE,
  resolveMostRestrictiveStorageClassification,
  type AccountDeletionStorageClassification,
} from "./accountDeletionStoragePolicy";
import { JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE } from "./accountDeletionStorageReferenceRules";

export type AccountDeletionStoragePlanEntry = {
  bucket: string;
  path: string;
  classification: AccountDeletionStorageClassification;
  sourceType: string;
  sourceId: string | null;
  reason: string;
  requiresReferencesCleared?: boolean;
  manifestClassification: AccountDeletionStorageClassification;
};

export type AccountDeletionStoragePlan = {
  targetUserId: string;
  requestId: string | null;
  delete: AccountDeletionStoragePlanEntry[];
  preservePublic: AccountDeletionStoragePlanEntry[];
  preserveShared: AccountDeletionStoragePlanEntry[];
  blocked: AccountDeletionStoragePlanEntry[];
  skipped: AccountDeletionStoragePlanEntry[];
  warnings: string[];
  journeyReferenceInventoryComplete: boolean;
  unresolvedJourneyReferenceCount: number;
  journeyInventoryBlocked: boolean;
};

export type AccountDeletionStoragePlanBuildInput = {
  targetUserId: string;
  manifest: AccountDeletionManifest;
};

type ReferenceAccumulator = {
  bucket: string;
  path: string;
  refs: ManifestStorageObject[];
};

function ownershipSourcesFromManifestRefs(
  refs: ManifestStorageObject[]
): string[] {
  const combined = refs.flatMap((ref) => ref.ownershipSources ?? [ref.ownershipSource]);
  return [...new Set(combined)];
}

export function indexManifestStorageReferences(
  objects: ManifestStorageObject[]
): Map<string, ReferenceAccumulator> {
  const index = new Map<string, ReferenceAccumulator>();

  for (const object of objects) {
    const key = storageObjectKey(object.bucket, object.path);
    const existing = index.get(key);
    if (existing) {
      existing.refs.push(object);
      continue;
    }

    index.set(key, {
      bucket: object.bucket,
      path: object.path,
      refs: [object],
    });
  }

  return index;
}

export function classifyIndexedStorageReference(input: {
  targetUserId: string;
  entry: ReferenceAccumulator;
  journeyReferenceInventoryComplete: boolean;
}): AccountDeletionStoragePlanEntry {
  const { entry, targetUserId } = input;
  const primary = entry.refs[0];
  const ownershipSources = ownershipSourcesFromManifestRefs(entry.refs);
  const manifestClassification = primary.plannedClassification;

  const derived = classifyAccountDeletionStorageObject({
    bucket: entry.bucket,
    path: entry.path,
    targetUserId,
    ownershipSources,
    referencingTable: primary.referencingTable ?? null,
    journeyReferenceInventoryComplete: input.journeyReferenceInventoryComplete,
  });

  const classification = resolveMostRestrictiveStorageClassification(
    manifestClassification,
    derived.classification
  );

  const contract = assertManifestPlanContract({
    manifestClassification,
    planClassification: classification,
    bucket: entry.bucket,
    path: entry.path,
  });

  const safeClassification =
    contract.ok === false ? "BLOCK_UNRESOLVED" : classification;

  const sourceTypes = ownershipSources;
  const sourceIds = [
    ...new Set(
      entry.refs
        .map((ref) => ref.referencingRowId ?? null)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const reason =
    contract.ok === false
      ? contract.reason
      : safeClassification !== manifestClassification &&
          safeClassification !== derived.classification
        ? `Conservative merge selected ${safeClassification} over manifest=${manifestClassification} and derived=${derived.classification}.`
        : safeClassification !== manifestClassification
          ? derived.reason
          : entry.refs.find((ref) => ref.plannedClassification === safeClassification)
              ?.ownershipSource ?? derived.reason;

  return {
    bucket: entry.bucket,
    path: entry.path,
    classification: safeClassification,
    manifestClassification,
    sourceType: sourceTypes.join(" | "),
    sourceId: sourceIds[0] ?? null,
    reason,
    requiresReferencesCleared: entry.refs.some(
      (ref) => ref.requiresReferencesCleared === true
    ),
  };
}

export function buildAccountDeletionStoragePlan(
  input: AccountDeletionStoragePlanBuildInput
): AccountDeletionStoragePlan {
  const { manifest, targetUserId } = input;
  const warnings: string[] = [...manifest.warnings];
  const index = indexManifestStorageReferences(manifest.storage.objects);
  const deleteEntries: AccountDeletionStoragePlanEntry[] = [];
  const preservePublicEntries: AccountDeletionStoragePlanEntry[] = [];
  const preserveSharedEntries: AccountDeletionStoragePlanEntry[] = [];
  const blockedEntries: AccountDeletionStoragePlanEntry[] = [];
  const skippedEntries: AccountDeletionStoragePlanEntry[] = [];

  const journeyReferenceInventoryComplete =
    manifest.journey.journeyReferenceInventoryComplete;
  const unresolvedJourneyReferenceCount =
    manifest.journey.unresolvedJourneyReferenceCount;
  const journeyInventoryBlocked = !journeyReferenceInventoryComplete;

  if (journeyInventoryBlocked) {
    warnings.push(JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE);
  }

  for (const entry of index.values()) {
    const classified = classifyIndexedStorageReference({
      targetUserId,
      entry,
      journeyReferenceInventoryComplete,
    });

    const consistency = assertDeleteClassificationConsistent({
      bucket: entry.bucket,
      path: entry.path,
      classifications: [
        ...entry.refs.map((ref) => ref.plannedClassification),
        classified.classification,
      ],
    });

    const finalEntry =
      classified.classification === "PRESERVE_PUBLIC" ||
      classified.classification === "PRESERVE_SHARED"
        ? classified
        : consistency.ok === false
          ? {
              ...classified,
              classification: "BLOCK_UNRESOLVED" as const,
              reason: consistency.reason,
            }
          : classified;

    const escalation = assertManifestPlanContract({
      manifestClassification: finalEntry.manifestClassification,
      planClassification: finalEntry.classification,
      bucket: finalEntry.bucket,
      path: finalEntry.path,
    });

    const safeEntry =
      escalation.ok === false
        ? {
            ...finalEntry,
            classification: "BLOCK_UNRESOLVED" as const,
            reason: escalation.reason,
          }
        : finalEntry;

    const inventoryBlockedEntry =
      journeyInventoryBlocked &&
      entry.bucket === "journey-private-media" &&
      safeEntry.classification === "DELETE_PRIVATE"
        ? {
            ...safeEntry,
            classification: "BLOCK_UNRESOLVED" as const,
            reason: `${JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_CODE}: ${JOURNEY_REFERENCE_INVENTORY_INCOMPLETE_NOTE}`,
          }
        : safeEntry;

    switch (inventoryBlockedEntry.classification) {
      case "DELETE_PRIVATE":
        deleteEntries.push(inventoryBlockedEntry);
        break;
      case "PRESERVE_PUBLIC":
        preservePublicEntries.push(inventoryBlockedEntry);
        break;
      case "PRESERVE_SHARED":
        preserveSharedEntries.push(inventoryBlockedEntry);
        break;
      case "BLOCK_UNRESOLVED":
        blockedEntries.push(inventoryBlockedEntry);
        break;
      case "SKIP_UNKNOWN":
        skippedEntries.push(inventoryBlockedEntry);
        break;
      default:
        skippedEntries.push(inventoryBlockedEntry);
    }
  }

  if (manifest.journey.sentToOtherUserRows.count > 0) {
    warnings.push(
      "Sent inbox copies in other users' inboxes may reference shared journey-private-media objects that must be preserved."
    );
  }

  return {
    targetUserId,
    requestId: manifest.identity.requestId,
    delete: deleteEntries,
    preservePublic: preservePublicEntries,
    preserveShared: preserveSharedEntries,
    blocked: blockedEntries,
    skipped: skippedEntries,
    warnings,
    journeyReferenceInventoryComplete,
    unresolvedJourneyReferenceCount,
    journeyInventoryBlocked,
  };
}

export function rejectBrowserSuppliedStoragePlanEntries(
  entries: Array<{ bucket?: unknown; path?: unknown }> | null | undefined
): boolean {
  if (!entries || entries.length === 0) {
    return false;
  }

  return entries.some(
    (entry) =>
      typeof entry.bucket !== "string" ||
      typeof entry.path !== "string" ||
      entry.bucket.trim().length === 0 ||
      entry.path.trim().length === 0
  );
}

export function summarizeAccountDeletionStoragePlan(plan: AccountDeletionStoragePlan) {
  return {
    targetUserId: plan.targetUserId,
    requestId: plan.requestId,
    deleteCount: plan.delete.length,
    preservePublicCount: plan.preservePublic.length,
    preserveSharedCount: plan.preserveShared.length,
    blockedCount: plan.blocked.length,
    skippedCount: plan.skipped.length,
    warningCount: plan.warnings.length,
  };
}

export const journeyPrivateMediaReferenceRules = {
  recipientOwnedSource: "inbox_messages.user_id (recipient-owned)",
  sentCopySource: "inbox_messages.sender_user_id (sent copy in other inbox)",
};

export function assertManifestStoragePlanContract(
  manifest: AccountDeletionManifest,
  plan: AccountDeletionStoragePlan
): { ok: true } | { ok: false; reason: string } {
  const planEntries = [
    ...plan.delete,
    ...plan.preservePublic,
    ...plan.preserveShared,
    ...plan.blocked,
    ...plan.skipped,
  ];

  for (const manifestObject of manifest.storage.objects) {
    const planEntry = planEntries.find(
      (entry) =>
        entry.bucket === manifestObject.bucket &&
        entry.path === manifestObject.path
    );

    if (!planEntry) {
      return {
        ok: false,
        reason: `Missing plan entry for ${manifestObject.bucket}/${manifestObject.path}.`,
      };
    }

    const contract = assertManifestPlanContract({
      manifestClassification: manifestObject.plannedClassification,
      planClassification: planEntry.classification,
      bucket: manifestObject.bucket,
      path: manifestObject.path,
    });

    if (contract.ok === false) {
      return contract;
    }
  }

  return { ok: true };
}

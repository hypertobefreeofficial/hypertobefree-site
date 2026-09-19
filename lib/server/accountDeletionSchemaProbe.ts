import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parsed prerequisite from verify_account_deletion_schema_execution_ready().
 * Production emits legacy entries ({ satisfied }) and newer entries ({ ready }).
 */
export type AccountDeletionSchemaProbePrerequisite = {
  id: string;
  detail: string;
  satisfied?: boolean;
  ready?: boolean;
};

export type AccountDeletionSchemaProbeResult = {
  valid: boolean;
  ready: boolean;
  probeError: boolean;
  checkedAt: string | null;
  prerequisites: AccountDeletionSchemaProbePrerequisite[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A prerequisite is ready only when it signals success via strict boolean true.
 * Fail closed on explicit false on either field, or contradictory true/false pairs.
 */
export function isPrerequisiteReady(
  entry: AccountDeletionSchemaProbePrerequisite
): boolean {
  if (entry.satisfied === false || entry.ready === false) {
    return false;
  }

  return entry.satisfied === true || entry.ready === true;
}

function parsePrerequisite(
  value: unknown
): AccountDeletionSchemaProbePrerequisite | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const detail = typeof value.detail === "string" ? value.detail : "";

  if (!id) {
    return null;
  }

  const satisfied =
    value.satisfied === true
      ? true
      : value.satisfied === false
        ? false
        : undefined;
  const ready =
    value.ready === true ? true : value.ready === false ? false : undefined;

  return { id, detail, satisfied, ready };
}

export function parseAccountDeletionSchemaProbePayload(
  payload: unknown
): AccountDeletionSchemaProbeResult {
  if (!isRecord(payload)) {
    return {
      valid: false,
      ready: false,
      probeError: false,
      checkedAt: null,
      prerequisites: [],
    };
  }

  const ready = payload.ready === true;
  const checkedAt =
    typeof payload.checked_at === "string"
      ? payload.checked_at
      : payload.checkedAt === null
        ? null
        : typeof payload.checkedAt === "string"
          ? payload.checkedAt
          : null;

  const rawPrerequisites = payload.prerequisites;
  if (!Array.isArray(rawPrerequisites)) {
    return {
      valid: false,
      ready: false,
      probeError: false,
      checkedAt,
      prerequisites: [],
    };
  }

  const prerequisites = rawPrerequisites
    .map(parsePrerequisite)
    .filter(
      (entry): entry is AccountDeletionSchemaProbePrerequisite => entry !== null
    );

  if (prerequisites.length !== rawPrerequisites.length) {
    return {
      valid: false,
      ready: false,
      probeError: false,
      checkedAt,
      prerequisites,
    };
  }

  return {
    valid: true,
    ready,
    probeError: false,
    checkedAt,
    prerequisites,
  };
}

export function isSchemaExecutionReadyFromLiveProbe(
  probe: AccountDeletionSchemaProbeResult | null | undefined
): boolean {
  if (!probe) {
    return false;
  }

  return summarizeSchemaProbeReadiness(probe).liveCatalogReady;
}

export async function fetchAccountDeletionSchemaProbe(
  serviceRoleClient: SupabaseClient
): Promise<AccountDeletionSchemaProbeResult> {
  const { data, error } = await serviceRoleClient.rpc(
    "verify_account_deletion_schema_execution_ready"
  );

  if (error) {
    return {
      valid: false,
      ready: false,
      probeError: true,
      checkedAt: null,
      prerequisites: [],
    };
  }

  const parsed = parseAccountDeletionSchemaProbePayload(data);
  return parsed;
}

export function summarizeSchemaProbeReadiness(
  probe: AccountDeletionSchemaProbeResult
): {
  liveCatalogReady: boolean;
  unsatisfiedPrerequisiteIds: string[];
} {
  if (!probe.valid || probe.probeError) {
    return {
      liveCatalogReady: false,
      unsatisfiedPrerequisiteIds: [],
    };
  }

  if (!Array.isArray(probe.prerequisites) || probe.prerequisites.length === 0) {
    return {
      liveCatalogReady: false,
      unsatisfiedPrerequisiteIds: [],
    };
  }

  const unsatisfiedPrerequisiteIds = probe.prerequisites
    .filter((entry) => !isPrerequisiteReady(entry))
    .map((entry) => entry.id);

  const allPrerequisitesReady = unsatisfiedPrerequisiteIds.length === 0;
  const liveCatalogReady = probe.ready === true && allPrerequisitesReady;

  return {
    liveCatalogReady,
    unsatisfiedPrerequisiteIds,
  };
}

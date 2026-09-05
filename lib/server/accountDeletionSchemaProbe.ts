import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountDeletionSchemaProbePrerequisite = {
  id: string;
  satisfied: boolean;
  detail: string;
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

function parsePrerequisite(value: unknown): AccountDeletionSchemaProbePrerequisite | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const satisfied = value.satisfied === true;
  const detail = typeof value.detail === "string" ? value.detail : "";

  if (!id) {
    return null;
  }

  return { id, satisfied, detail };
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
    .filter((entry) => entry.satisfied !== true)
    .map((entry) => entry.id);

  const allPrerequisitesSatisfied = unsatisfiedPrerequisiteIds.length === 0;
  const liveCatalogReady = probe.ready === true && allPrerequisitesSatisfied;

  return {
    liveCatalogReady,
    unsatisfiedPrerequisiteIds,
  };
}

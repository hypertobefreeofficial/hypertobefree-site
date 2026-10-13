/**
 * Fail-closed request allowlist for permanent account deletion execution (3B.4D.5A).
 * Required whenever HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED is true.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV =
  "HTBF_ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS" as const;

export type AccountDeletionExecutionAllowlistParseResult =
  | { ok: true; allowedRequestIds: ReadonlySet<string> }
  | { ok: false; code: "missing" | "empty" | "malformed" };

export type AccountDeletionExecutionAllowlistEvaluation =
  | { ok: true }
  | { ok: false; code: "configuration_invalid" | "request_not_allowed" };

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

export function isAccountDeletionExecutionAllowlistUuid(
  value: string
): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Parses comma-separated request UUIDs. Rejects empty config, empty segments,
 * and any malformed UUID (no partial acceptance).
 */
export function parseAccountDeletionExecutionAllowlist(
  raw: string | undefined
): AccountDeletionExecutionAllowlistParseResult {
  if (raw === undefined) {
    return { ok: false, code: "missing" };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "empty" };
  }

  const segments = trimmed.split(",");
  const allowedRequestIds = new Set<string>();

  for (const segment of segments) {
    const entry = segment.trim();
    if (entry.length === 0) {
      return { ok: false, code: "malformed" };
    }
    if (!isAccountDeletionExecutionAllowlistUuid(entry)) {
      return { ok: false, code: "malformed" };
    }
    allowedRequestIds.add(normalizeUuid(entry));
  }

  if (allowedRequestIds.size === 0) {
    return { ok: false, code: "empty" };
  }

  return { ok: true, allowedRequestIds };
}

/**
 * Exact UUID membership for the route requestId only (case-insensitive compare).
 */
export function evaluateAccountDeletionExecutionRequestAllowlist(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env
): AccountDeletionExecutionAllowlistEvaluation {
  const parsed = parseAccountDeletionExecutionAllowlist(
    env[ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV]
  );
  if (parsed.ok === false) {
    return { ok: false, code: "configuration_invalid" };
  }

  if (!isAccountDeletionExecutionAllowlistUuid(requestId)) {
    return { ok: false, code: "request_not_allowed" };
  }

  if (!parsed.allowedRequestIds.has(normalizeUuid(requestId))) {
    return { ok: false, code: "request_not_allowed" };
  }

  return { ok: true };
}

export const ACCOUNT_DELETION_EXECUTION_ALLOWLIST_NOTE =
  "When HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED is true, "
  + "HTBF_ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS must list every "
  + "request UUID that may invoke permanent execution; unset/empty/malformed "
  + "config or non-member requestId fails closed before orchestrator work.";

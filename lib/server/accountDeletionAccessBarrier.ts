import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_IN_PROGRESS_CODE,
  accountDeletionInProgressJsonBody,
} from "./accountDeletionActorWriteGuard";

export type AccountDeletionAccessBarrierResult =
  | { blocked: false }
  | {
      blocked: true;
      code: typeof ACCOUNT_DELETION_IN_PROGRESS_CODE;
    };

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChangingHttpMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

/**
 * Defense-in-depth for stale access JWTs: uses current_user_account_write_blocked()
 * which mirrors deletion_in_progress target identity (user_id or snapshot).
 */
export async function checkCurrentUserDeletionInProgress(
  supabase: SupabaseClient
): Promise<AccountDeletionAccessBarrierResult> {
  const { data, error } = await supabase.rpc("current_user_account_write_blocked");

  if (error) {
    return {
      blocked: true,
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    };
  }

  if (data === true) {
    return {
      blocked: true,
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    };
  }

  return { blocked: false };
}

export function accountDeletionAccessBlockedResponse(): Response {
  return Response.json(accountDeletionInProgressJsonBody(), { status: 403 });
}

export const ACCOUNT_DELETION_STALE_JWT_ACCESS_BARRIER_NOTE =
  "Session revocation destroys refresh tokens but existing access JWTs remain valid until exp. "
  + "Application routes must call checkCurrentUserDeletionInProgress() for state-changing requests "
  + "in addition to DB RLS (2B.0A) and shared triggers (2C.2A). Read-only GET navigation may "
  + "continue briefly until JWT expiry — reads do not invalidate deletion inventory.";

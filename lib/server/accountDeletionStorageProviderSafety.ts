/**
 * Neutral server-only Supabase Storage safety primitives shared by narrow
 * account-deletion adapters. This module grants no bucket selection authority.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
  type AccountDeletionStorageObjectExistence,
} from "./accountDeletionStorageObjectExistence";

export type AccountDeletionStorageProviderErrorLike = {
  message?: string;
  statusCode?: string | number;
  status?: string | number;
  name?: string;
};

export function normalizeAccountDeletionStorageHttpStatus(
  value: unknown
): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^[1-5][0-9]{2}$/.test(value)) {
    return Number(value);
  }
  return null;
}

export function classifyAccountDeletionStorageDownloadExistence(
  data: Blob | null | undefined,
  error: AccountDeletionStorageProviderErrorLike | null | undefined
): AccountDeletionStorageObjectExistence {
  if (data != null && error == null) {
    return { status: "exists" };
  }

  if (data == null && error != null) {
    const populatedStatuses = [error.statusCode, error.status].filter(
      (value) => value !== null && value !== undefined
    );
    if (
      populatedStatuses.length > 0 &&
      populatedStatuses.every(
        (value) => normalizeAccountDeletionStorageHttpStatus(value) === 404
      )
    ) {
      return { status: "absent" };
    }
  }

  // Mixed data/error, contradictory statuses, and provider text are never
  // definitive. Absence requires only consistently structured HTTP 404 fields.
  return {
    status: "uncertain",
    code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
  };
}

export function createAccountDeletionServiceRoleSupabaseClient(
  env: NodeJS.ProcessEnv = process.env
): SupabaseClient {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("account_deletion_missing_supabase_service_role_config");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

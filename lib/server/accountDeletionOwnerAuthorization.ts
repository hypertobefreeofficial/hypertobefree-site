import { createClient } from "@supabase/supabase-js";

/**
 * HTBF founder/root authority: profiles.is_owner via current_user_is_owner() RPC.
 * Staff admins (profiles.is_admin without is_owner) may review/approve but not execute.
 */
export async function verifyOwnerForAccountDeletionExecution(
  accessToken: string
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const scopedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data, error } = await scopedClient.rpc("current_user_is_owner");
  return !error && data === true;
}

export const ACCOUNT_DELETION_OWNER_EXECUTION_AUTHORITY_SOURCE =
  "profiles.is_owner checked via authenticated RPC current_user_is_owner(); "
  + "DB acquisition RPC independently verifies profiles.is_owner for p_initiated_by via "
  + "account_deletion_actor_is_owner(uuid).";

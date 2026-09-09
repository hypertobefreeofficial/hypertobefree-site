import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  checkCurrentUserDeletionInProgress,
  isStateChangingHttpMethod,
} from "./accountDeletionAccessBarrier";
import { readBearerToken } from "./publicVideoResponseRequest";

export type AuthenticatedSupabaseContext = {
  user: User;
  accessToken: string;
  supabase: SupabaseClient;
};

export type AuthenticateSupabaseResult =
  | { ok: true; context: AuthenticatedSupabaseContext }
  | { ok: false; status: 401 | 403 | 503; code: string; error: string };

export async function authenticateSupabaseRequest(
  request: Request
): Promise<AuthenticateSupabaseResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 503,
      code: "service_unavailable",
      error: "Moderation is unavailable right now.",
    };
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    };
  }

  if (isStateChangingHttpMethod(request.method)) {
    const deletionBlock = await checkCurrentUserDeletionInProgress(supabase);
    if (deletionBlock.blocked) {
      return {
        ok: false,
        status: 403,
        code: deletionBlock.code,
        error:
          "Account deletion is in progress. Changes are temporarily unavailable.",
      };
    }
  }

  return {
    ok: true,
    context: {
      user: data.user,
      accessToken,
      supabase,
    },
  };
}

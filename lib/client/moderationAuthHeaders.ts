import { supabase } from "../supabaseClient";

export async function buildModerationAuthHeaders(
  extra: Record<string, string> = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
}

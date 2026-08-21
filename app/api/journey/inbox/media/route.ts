import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseRequest } from "../../../../../lib/server/authenticateSupabaseRequest";
import {
  readJourneyInboxMediaMessageId,
  rejectArbitraryStoragePathRequest,
  resolveJourneyInboxMediaAccess,
} from "../../../../../lib/server/journeyInboxMedia";

function json(body: unknown, status: number, extraHeaders?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}

export async function GET(request: Request) {
  if (rejectArbitraryStoragePathRequest(request)) {
    return json(
      {
        ok: false,
        error: "Storage paths cannot be requested directly.",
        code: "invalid_request",
      },
      400
    );
  }

  const messageId = readJourneyInboxMediaMessageId(request);
  if (!messageId) {
    return json(
      {
        ok: false,
        error: "Message id is required.",
        code: "invalid_message_id",
      },
      400
    );
  }

  const auth = await authenticateSupabaseRequest(request);
  if (auth.ok === false) {
    return json(
      { ok: false, error: auth.error, code: auth.code },
      auth.status
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(
      {
        ok: false,
        error: "Private inbox media is unavailable right now.",
        code: "service_unavailable",
      },
      503
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await resolveJourneyInboxMediaAccess({
    adminClient,
    userId: auth.context.user.id,
    messageId,
  });

  if (result.ok === false) {
    return json(
      { ok: false, error: result.error, code: result.code },
      result.status
    );
  }

  return json(
    {
      ok: true,
      signedUrl: result.signedUrl,
      expiresAt: result.expiresAt,
      legacy: result.legacy,
    },
    200
  );
}

import { createClient } from "@supabase/supabase-js";
import { moderatePublicContent } from "../../../../lib/server/moderatePublicContent";

type PrayerStoryRow = {
  id: string;
  user_id: string | null;
  story_type: string | null;
  story_text: string | null;
  status: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return Response.json(
      { error: "Public prayer response submission is unavailable." },
      { status: 503 }
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prayerStoryId =
    typeof body.prayer_story_id === "string"
      ? body.prayer_story_id.trim()
      : "";
  const responseVideoUrl =
    typeof body.response_video_url === "string"
      ? body.response_video_url.trim()
      : "";

  if (!prayerStoryId || !responseVideoUrl) {
    return Response.json(
      { error: "Prayer ID and response video are required." },
      { status: 400 }
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceRoleDebug = {
    serviceRoleKeyExists: Boolean(serviceRoleKey),
    serviceRoleKeyMatchesAnonKey: serviceRoleKey === supabaseAnonKey,
    adminClientCredentialSource: "SUPABASE_SERVICE_ROLE_KEY",
  };
  const { data: prayerData, error: prayerError } = await adminClient
    .from("stories")
    .select("id, user_id, story_type, story_text, status")
    .eq("id", prayerStoryId)
    .maybeSingle();

  if (prayerError) {
    return Response.json(
      { error: "Could not load the parent prayer." },
      { status: 500 }
    );
  }

  const prayer = prayerData as PrayerStoryRow | null;
  const isApprovedPrayer =
    prayer?.status === "approved" &&
    (prayer.story_type?.toLowerCase().includes("prayer") ?? false);

  if (!prayer || !isApprovedPrayer) {
    return Response.json(
      { error: "The parent prayer is not available for public responses." },
      { status: 400 }
    );
  }

  if (!prayer.user_id || prayer.user_id === user.id) {
    return Response.json(
      { error: "You cannot submit a public response to this prayer." },
      { status: 400 }
    );
  }

  const { data: insertedData, error: insertError } = await adminClient
    .from("prayer_video_responses")
    .insert({
      story_id: prayerStoryId,
      user_id: user.id,
      video_url: responseVideoUrl,
      body: null,
      status: "submitted",
    })
    .select("id")
    .single();

  if (insertError || !insertedData?.id) {
    const insertDebug = {
      ...serviceRoleDebug,
      message: insertError?.message ?? null,
      code: insertError?.code ?? null,
      details: insertError?.details ?? null,
      hint: insertError?.hint ?? null,
    };

    console.error("Prayer video response server insert failed:", insertDebug);

    return Response.json(
      {
        error: insertError?.message ?? "Could not create the response.",
        debug: insertDebug,
      },
      { status: 500 }
    );
  }

  const responseId = String(insertedData.id);
  const decision = await moderatePublicContent({
    storyType: "public_prayer_response",
    storyText: prayer.story_text ?? "",
    hasVideo: true,
    hasPhoto: false,
  });

  if (decision.statusToUse !== "approved") {
    return Response.json({ response_id: responseId, status: "submitted" });
  }

  const { error: updateError } = await adminClient
    .from("prayer_video_responses")
    .update({
      status: "approved",
      moderated_at: new Date().toISOString(),
    })
    .eq("id", responseId)
    .eq("user_id", user.id)
    .eq("status", "submitted");

  if (updateError) {
    console.error("Could not apply prayer response AI approval:", updateError);
    return Response.json({ response_id: responseId, status: "submitted" });
  }

  return Response.json({ response_id: responseId, status: "approved" });
}

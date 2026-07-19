import {
  emptyTextModerationResponse,
  getModerationDecision,
  type ModerationResult,
} from "./moderateStoryDecision";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
} from "./prayerRateLimit";
import { readClientIp } from "./requestIdentity";
import type { AuthenticatedSupabaseContext } from "./authenticateSupabaseRequest";
import {
  buildSuppressedDemoStoryModerationBody,
  shouldSuppressBillableAiCall,
} from "../demo-content/externalServiceIsolation";

export const MODERATE_STORY_MAX_TEXT_CHARS = 12_000;
export const MODERATE_STORY_MAX_TYPE_CHARS = 120;
export const MODERATE_STORY_OPENAI_TIMEOUT_MS = 12_000;
export const MODERATE_STORY_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

/** In-memory per Vercel instance — not distributed; duplicate submits may hit OpenAI on other instances. */
export const MODERATE_STORY_IDEMPOTENCY_NOTE =
  "Per-instance 5-minute cache only; not durable across instances or deploys.";

type IdempotencyEntry = {
  expiresAt: number;
  body: Record<string, unknown>;
};

const idempotencyCache = new Map<string, IdempotencyEntry>();

export type ModerateStoryRequestBody = {
  story_text?: unknown;
  story_type?: unknown;
  has_video?: unknown;
  has_photo?: unknown;
};

export type ModerateStoryHandlerResult =
  | {
      ok: true;
      status: 200;
      body: Record<string, unknown>;
      idempotent: boolean;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
      retryAfterSeconds?: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hashModerationInput(userId: string, storyType: string, storyText: string) {
  let hash = 2166136261;
  const input = `${userId}\0${storyType}\0${storyText}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readIdempotentResponse(cacheKey: string) {
  const entry = idempotencyCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    idempotencyCache.delete(cacheKey);
    return null;
  }
  return entry.body;
}

function storeIdempotentResponse(cacheKey: string, body: Record<string, unknown>) {
  idempotencyCache.set(cacheKey, {
    expiresAt: Date.now() + MODERATE_STORY_IDEMPOTENCY_TTL_MS,
    body,
  });
}

export function parseModerateStoryBody(body: unknown):
  | { ok: true; storyText: string; storyType: string }
  | { ok: false; code: string; error: string } {
  if (!isRecord(body)) {
    return { ok: false, code: "invalid_body", error: "Invalid request body." };
  }

  const storyText =
    typeof body.story_text === "string" ? body.story_text.trim() : "";
  const storyType =
    typeof body.story_type === "string" ? body.story_type.trim() : "";

  if (storyText.length > MODERATE_STORY_MAX_TEXT_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Story text is too long to moderate.",
    };
  }

  if (storyType.length > MODERATE_STORY_MAX_TYPE_CHARS) {
    return {
      ok: false,
      code: "payload_too_large",
      error: "Story type is too long to moderate.",
    };
  }

  return { ok: true, storyText, storyType };
}

export function checkModerateStoryRateLimit(options: {
  userId: string;
  clientIp: string;
}) {
  const userLimit = checkPrayerRateLimit(
    rateLimitKey(options.userId, "moderateStory"),
    PRAYER_RATE_LIMITS.moderateStory
  );
  if (userLimit.allowed === false) {
    return userLimit;
  }

  return checkPrayerRateLimit(
    rateLimitKey(options.clientIp, "moderateStoryIp"),
    PRAYER_RATE_LIMITS.moderateStoryIp
  );
}

async function callOpenAiModeration(inputText: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MODERATE_STORY_OPENAI_TIMEOUT_MS
  );

  try {
    const moderationResponse = await fetch(
      "https://api.openai.com/v1/moderations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: inputText,
        }),
        signal: controller.signal,
      }
    );

    if (!moderationResponse.ok) {
      return {
        ok: false as const,
        status: moderationResponse.status,
      };
    }

    const moderationData = await moderationResponse.json();
    const result = moderationData.results?.[0] as ModerationResult | undefined;
    if (!result) {
      return { ok: false as const, status: 502 };
    }

    return { ok: true as const, result };
  } catch {
    return { ok: false as const, status: 504 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleModerateStoryRequest(options: {
  request: Request;
  auth: AuthenticatedSupabaseContext;
  requestId: string;
}): Promise<ModerateStoryHandlerResult> {
  const clientIp = readClientIp(options.request);
  const rateLimit = checkModerateStoryRateLimit({
    userId: options.auth.user.id,
    clientIp,
  });

  if (rateLimit.allowed === false) {
    console.warn(
      JSON.stringify({
        kind: "moderate_story",
        requestId: options.requestId,
        code: "rate_limited",
        userId: options.auth.user.id,
      })
    );
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      error: "Too many moderation requests. Please wait and try again.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  let body: unknown;
  try {
    body = await options.request.json();
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      error: "Invalid request body.",
    };
  }

  const parsed = parseModerateStoryBody(body);
  if (parsed.ok === false) {
    return {
      ok: false,
      status: parsed.code === "payload_too_large" ? 413 : 400,
      code: parsed.code,
      error: parsed.error,
    };
  }

  const inputText = [parsed.storyType, parsed.storyText].filter(Boolean).join("\n\n");
  if (!inputText) {
    const empty = emptyTextModerationResponse();
    return {
      ok: true,
      status: 200,
      idempotent: false,
      body: {
        ...empty,
        rawFlagged: false,
      },
    };
  }

  const cacheKey = hashModerationInput(
    options.auth.user.id,
    parsed.storyType,
    parsed.storyText
  );
  const cached = readIdempotentResponse(cacheKey);
  if (cached) {
    console.info(
      JSON.stringify({
        kind: "moderate_story",
        requestId: options.requestId,
        code: "idempotent_hit",
        userId: options.auth.user.id,
      })
    );
    return {
      ok: true,
      status: 200,
      idempotent: true,
      body: cached,
    };
  }

  let actorProfile: { is_demo?: boolean | null; demo_seed_run_id?: string | null } | null =
    null;

  if (typeof options.auth.supabase?.from === "function") {
    const { data } = await options.auth.supabase
      .from("profiles")
      .select("is_demo, demo_seed_run_id")
      .eq("id", options.auth.user.id)
      .maybeSingle();
    actorProfile = data as {
      is_demo?: boolean | null;
      demo_seed_run_id?: string | null;
    } | null;
  }

  if (shouldSuppressBillableAiCall({ actor: actorProfile })) {
    const suppressed = buildSuppressedDemoStoryModerationBody();
    storeIdempotentResponse(cacheKey, suppressed);
    return {
      ok: true,
      status: 200,
      idempotent: false,
      body: suppressed,
    };
  }

  const rawApiKey = process.env.OPENAI_API_KEY ?? "";
  const apiKeyMatch = rawApiKey.match(/sk-[A-Za-z0-9_-]+/);
  const apiKey = apiKeyMatch?.[0];

  if (!apiKey) {
    console.error(
      JSON.stringify({
        kind: "moderate_story",
        requestId: options.requestId,
        code: "provider_unconfigured",
      })
    );
    return {
      ok: false,
      status: 503,
      code: "provider_unconfigured",
      error: "Moderation is unavailable right now.",
    };
  }

  const providerResult = await callOpenAiModeration(inputText, apiKey);
  if (providerResult.ok === false) {
    console.error(
      JSON.stringify({
        kind: "moderate_story",
        requestId: options.requestId,
        code: "provider_failed",
        providerStatus: providerResult.status,
        userId: options.auth.user.id,
      })
    );
    return {
      ok: false,
      status: 502,
      code: "provider_failed",
      error: "We couldn't complete moderation. Please try again.",
    };
  }

  const decision = getModerationDecision(providerResult.result);
  const responseBody = {
    ...decision,
    aiReviewStatus: "completed",
    rawFlagged: providerResult.result.flagged,
  };

  storeIdempotentResponse(cacheKey, responseBody);

  console.info(
    JSON.stringify({
      kind: "moderate_story",
      requestId: options.requestId,
      code: "completed",
      userId: options.auth.user.id,
      statusToUse: decision.statusToUse,
      aiRiskLevel: decision.aiRiskLevel,
    })
  );

  return {
    ok: true,
    status: 200,
    idempotent: false,
    body: responseBody,
  };
}

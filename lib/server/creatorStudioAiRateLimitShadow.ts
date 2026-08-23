import { hashUserIdForLog } from "./aiSafetyLog";
import type { CreatorStudioAiEndpoint } from "./prayerRateLimit";
import {
  isShadowRateLimitConfigReady,
  readEffectiveAiRateLimitMode,
  readRateLimitKeySalt,
  readUpstashRedisConfig,
} from "./rateLimitMode";
import {
  createUpstashRateLimitBackend,
  type UpstashEvalClient,
  type UpstashRateLimitBackend,
} from "./upstashRateLimitBackend";
import type { RateLimitCheckResult, RateLimitWindow } from "./rateLimitTypes";

export const CREATOR_STUDIO_AI_SHADOW_KEY_PREFIX = "shadow";

export type ShadowRateLimitOutcome =
  | "local_allow_distributed_allow"
  | "local_allow_distributed_block"
  | "local_block_distributed_allow"
  | "local_block_distributed_block"
  | "distributed_unavailable";

let cachedShadowBackend: UpstashRateLimitBackend | null | undefined;
let shadowEvalClientFactory: (() => UpstashEvalClient | null) | undefined;

function createDefaultShadowEvalClient(): UpstashEvalClient | null {
  const config = readUpstashRedisConfig();
  if (!config) {
    return null;
  }

  return {
    eval: async (script, keys, args) => {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({
        url: config.url,
        token: config.token,
      });
      return redis.eval(script, keys, args);
    },
  };
}

function getShadowBackend(): UpstashRateLimitBackend | null {
  if (cachedShadowBackend !== undefined) {
    return cachedShadowBackend;
  }

  if (!isShadowRateLimitConfigReady()) {
    cachedShadowBackend = null;
    return null;
  }

  const salt = readRateLimitKeySalt();
  if (!salt) {
    cachedShadowBackend = null;
    return null;
  }

  const client = shadowEvalClientFactory?.() ?? createDefaultShadowEvalClient();
  if (!client) {
    cachedShadowBackend = null;
    return null;
  }

  cachedShadowBackend = createUpstashRateLimitBackend({
    client,
    salt,
  });
  return cachedShadowBackend;
}

export function resetShadowRateLimitBackendForTests() {
  cachedShadowBackend = undefined;
  shadowEvalClientFactory = undefined;
}

export function setShadowRateLimitEvalClientFactoryForTests(
  factory: (() => UpstashEvalClient | null) | undefined
) {
  shadowEvalClientFactory = factory;
  cachedShadowBackend = undefined;
}

export function classifyShadowRateLimitOutcome(options: {
  localAllowed: boolean;
  distributedAllowed: boolean;
}): Exclude<ShadowRateLimitOutcome, "distributed_unavailable"> {
  if (options.localAllowed && options.distributedAllowed) {
    return "local_allow_distributed_allow";
  }
  if (options.localAllowed && !options.distributedAllowed) {
    return "local_allow_distributed_block";
  }
  if (!options.localAllowed && options.distributedAllowed) {
    return "local_block_distributed_allow";
  }
  return "local_block_distributed_block";
}

export function logShadowRateLimitOutcome(options: {
  outcome: ShadowRateLimitOutcome;
  endpoint: CreatorStudioAiEndpoint;
  userId: string;
  localAllowed: boolean;
  distributed?: RateLimitCheckResult | null;
}) {
  try {
    console.info("[ai-rate-limit-shadow]", {
      outcome: options.outcome,
      endpoint: options.endpoint,
      userIdHash: hashUserIdForLog(options.userId),
      localAllowed: options.localAllowed,
      ...(options.distributed
        ? {
            distributedAllowed: options.distributed.allowed,
            ...(options.distributed.allowed === false
              ? { retryAfterSeconds: options.distributed.retryAfterSeconds }
              : {}),
          }
        : {}),
    });
  } catch {
    // Shadow logging must never break AI route handling.
  }
}

export function observeCreatorStudioAiShadowRateLimit(options: {
  userId: string;
  endpoint: CreatorStudioAiEndpoint;
  localAllowed: boolean;
  windows: readonly RateLimitWindow[];
}) {
  if (readEffectiveAiRateLimitMode() !== "shadow") {
    return;
  }

  void runCreatorStudioAiShadowObservation(options);
}

async function runCreatorStudioAiShadowObservation(options: {
  userId: string;
  endpoint: CreatorStudioAiEndpoint;
  localAllowed: boolean;
  windows: readonly RateLimitWindow[];
}) {
  const backend = getShadowBackend();
  if (!backend) {
    logShadowRateLimitOutcome({
      outcome: "distributed_unavailable",
      endpoint: options.endpoint,
      userId: options.userId,
      localAllowed: options.localAllowed,
      distributed: null,
    });
    return;
  }

  try {
    const distributed = await backend.checkAndConsume({
      keyPrefix: CREATOR_STUDIO_AI_SHADOW_KEY_PREFIX,
      namespace: options.endpoint,
      subject: options.userId,
      subjectType: "u",
      windows: options.windows,
    });

    logShadowRateLimitOutcome({
      outcome: classifyShadowRateLimitOutcome({
        localAllowed: options.localAllowed,
        distributedAllowed: distributed.allowed,
      }),
      endpoint: options.endpoint,
      userId: options.userId,
      localAllowed: options.localAllowed,
      distributed,
    });
  } catch {
    logShadowRateLimitOutcome({
      outcome: "distributed_unavailable",
      endpoint: options.endpoint,
      userId: options.userId,
      localAllowed: options.localAllowed,
      distributed: null,
    });
  }
}

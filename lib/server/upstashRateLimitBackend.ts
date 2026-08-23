import { MULTI_WINDOW_RATE_LIMIT_LUA } from "./rateLimitLua";
import {
  buildRateLimitRedisKey,
  hashRateLimitSubject,
  windowLabelFor,
} from "./rateLimitSubjectHash";
import type {
  RateLimitBackend,
  RateLimitCheckInput,
  RateLimitCheckResult,
} from "./rateLimitTypes";

export const UPSTASH_RATE_LIMIT_TIMEOUT_MS = 1_500;

export type UpstashEvalClient = {
  eval: (
    script: string,
    keys: string[],
    args: string[]
  ) => Promise<unknown>;
};

function ttlSecondsFor(windowMs: number) {
  return Math.max(1, Math.ceil(windowMs / 1000));
}

export function buildUpstashRateLimitKeys(options: {
  input: RateLimitCheckInput;
  salt: string;
}): string[] {
  const subjectHash = hashRateLimitSubject({
    namespace: options.input.namespace,
    subject: options.input.subject,
    salt: options.salt,
  });

  return options.input.windows.map((window) =>
    buildRateLimitRedisKey({
      keyPrefix: options.input.keyPrefix,
      subjectType: options.input.subjectType ?? "u",
      namespace: options.input.namespace,
      subjectHash,
      windowLabel: windowLabelFor(window.windowMs),
    })
  );
}

export function buildUpstashRateLimitArgs(
  windows: RateLimitCheckInput["windows"]
): string[] {
  const args: string[] = [];

  for (const window of windows) {
    args.push(String(window.limit));
    args.push(String(ttlSecondsFor(window.windowMs)));
  }

  return args;
}

export function parseUpstashRateLimitEvalResult(
  raw: unknown,
  windows: RateLimitCheckInput["windows"]
): RateLimitCheckResult {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("malformed_rate_limit_response");
  }

  const allowedFlag = Number(raw[0]);
  const retryAfterSeconds = Number(raw[1]);

  if (allowedFlag === 1) {
    const counts = raw.slice(2).map((value) => Number(value));
    if (counts.length !== windows.length || counts.some((n) => !Number.isFinite(n))) {
      throw new Error("malformed_rate_limit_response");
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      counts,
    };
  }

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 1) {
    throw new Error("malformed_rate_limit_response");
  }

  const blockedWindowMs = blockedWindowMsForRetry(windows, retryAfterSeconds);

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    blockedWindowMs,
  };
}

function blockedWindowMsForRetry(
  windows: RateLimitCheckInput["windows"],
  retryAfterSeconds: number
) {
  let bestWindowMs = windows[0]?.windowMs ?? 3_600_000;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const window of windows) {
    const delta = Math.abs(ttlSecondsFor(window.windowMs) - retryAfterSeconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestWindowMs = window.windowMs;
    }
  }

  return bestWindowMs;
}

export class UpstashRateLimitBackend implements RateLimitBackend {
  constructor(
    private readonly client: UpstashEvalClient,
    private readonly salt: string,
    private readonly timeoutMs = UPSTASH_RATE_LIMIT_TIMEOUT_MS
  ) {}

  async checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    const keys = buildUpstashRateLimitKeys({ input, salt: this.salt });
    const args = buildUpstashRateLimitArgs(input.windows);

    for (const key of keys) {
      if (input.subject.includes(key) || key.includes(input.subject)) {
        throw new Error("unsafe_rate_limit_key_material");
      }
    }

    const raw = await this.evalWithTimeout(keys, args);
    return parseUpstashRateLimitEvalResult(raw, input.windows);
  }

  private evalWithTimeout(keys: string[], args: string[]) {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const evalPromise = this.client
      .eval(MULTI_WINDOW_RATE_LIMIT_LUA, keys, args)
      .then((value) => {
        if (settled) {
          return value;
        }
        settled = true;
        return value;
      })
      .catch((error) => {
        if (settled) {
          return Promise.reject(error);
        }
        settled = true;
        throw error;
      });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("rate_limit_redis_timeout"));
      }, this.timeoutMs);
    });

    void evalPromise.catch(() => {
      // Swallow late eval failures after a timeout wins the race.
    });

    return Promise.race([evalPromise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }
}

export function createUpstashRateLimitBackend(options: {
  client: UpstashEvalClient;
  salt: string;
  timeoutMs?: number;
}) {
  return new UpstashRateLimitBackend(
    options.client,
    options.salt,
    options.timeoutMs
  );
}

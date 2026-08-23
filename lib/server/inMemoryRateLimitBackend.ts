import type {
  RateLimitBackend,
  RateLimitCheckInput,
  RateLimitCheckResult,
  RateLimitWindow,
} from "./rateLimitTypes";

type Bucket = {
  count: number;
  resetAt: number;
};

function bucketKeyFor(storageKey: string, window: RateLimitWindow) {
  return `${storageKey}:${window.limit}:${window.windowMs}`;
}

function resolveStorageKey(input: RateLimitCheckInput) {
  return `${input.keyPrefix}:${input.namespace}:${input.subject}`;
}

export class InMemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, Bucket>();

  async checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    return this.checkAndConsumeSync(input);
  }

  checkAndConsumeSync(input: RateLimitCheckInput): RateLimitCheckResult {
    const now = input.now ?? Date.now();
    const storageKey = resolveStorageKey(input);
    let blocked: { retryAfterSeconds: number; blockedWindowMs: number } | null =
      null;

    for (const window of input.windows) {
      const peek = this.peek(storageKey, window, now);
      if (peek.allowed === false) {
        if (!blocked || peek.retryAfterSeconds > blocked.retryAfterSeconds) {
          blocked = {
            retryAfterSeconds: peek.retryAfterSeconds,
            blockedWindowMs: window.windowMs,
          };
        }
      }
    }

    if (blocked) {
      return {
        allowed: false,
        retryAfterSeconds: blocked.retryAfterSeconds,
        blockedWindowMs: blocked.blockedWindowMs,
      };
    }

    const counts: number[] = [];
    for (const window of input.windows) {
      counts.push(this.increment(storageKey, window, now));
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      counts,
    };
  }

  resetForTests() {
    this.buckets.clear();
  }

  readCountForTests(
    input: RateLimitCheckInput,
    window: RateLimitWindow,
    now = Date.now()
  ) {
    const storageKey = resolveStorageKey(input);
    const bucketKey = bucketKeyFor(storageKey, window);
    const existing = this.buckets.get(bucketKey);
    if (!existing || now >= existing.resetAt) {
      return 0;
    }
    return existing.count;
  }

  private peek(
    storageKey: string,
    window: RateLimitWindow,
    now: number
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const bucketKey = bucketKeyFor(storageKey, window);
    this.maybeRemoveExpired(bucketKey, now);
    const active = this.buckets.get(bucketKey);

    if (!active) {
      return { allowed: true };
    }

    if (active.count >= window.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((active.resetAt - now) / 1000)
        ),
      };
    }

    return { allowed: true };
  }

  private increment(storageKey: string, window: RateLimitWindow, now: number) {
    const bucketKey = bucketKeyFor(storageKey, window);
    this.maybeRemoveExpired(bucketKey, now);
    const active = this.buckets.get(bucketKey);

    if (!active) {
      this.buckets.set(bucketKey, {
        count: 1,
        resetAt: now + window.windowMs,
      });
      return 1;
    }

    active.count += 1;
    return active.count;
  }

  private maybeRemoveExpired(bucketKey: string, now: number) {
    const existing = this.buckets.get(bucketKey);
    if (existing && now >= existing.resetAt) {
      this.buckets.delete(bucketKey);
    }
  }
}

export const defaultInMemoryRateLimitBackend = new InMemoryRateLimitBackend();

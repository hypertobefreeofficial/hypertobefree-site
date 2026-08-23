export type RateLimitSubjectType = "u" | "ip";

export type RateLimitWindow = {
  limit: number;
  windowMs: number;
};

export type RateLimitCheckInput = {
  /** Endpoint namespace, e.g. shape_story */
  namespace: string;
  /** Raw subject identifier — hashed before Redis key materialization. */
  subject: string;
  subjectType?: RateLimitSubjectType;
  windows: readonly RateLimitWindow[];
  now?: number;
  /** rl:v1 key segment — shadow in 4B.1, enforce later. */
  keyPrefix: string;
};

export type RateLimitCheckResult =
  | {
      allowed: true;
      retryAfterSeconds: 0;
      counts: number[];
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      blockedWindowMs: number;
      counts?: number[];
    };

export type RateLimitBackend = {
  checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitCheckResult>;
};

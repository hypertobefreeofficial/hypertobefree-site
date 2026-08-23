import { createHmac } from "node:crypto";

import type { RateLimitSubjectType } from "./rateLimitTypes";

export function hashRateLimitSubject(options: {
  namespace: string;
  subject: string;
  salt: string;
}): string {
  return createHmac("sha256", options.salt)
    .update(`${options.namespace}\0${options.subject}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function windowLabelFor(windowMs: number): string {
  if (windowMs === 60 * 60 * 1000) return "1h";
  if (windowMs === 24 * 60 * 60 * 1000) return "24h";
  return `${windowMs}ms`;
}

export function buildRateLimitRedisKey(options: {
  keyPrefix: string;
  subjectType: RateLimitSubjectType;
  namespace: string;
  subjectHash: string;
  windowLabel: string;
}): string {
  return `rl:v1:${options.keyPrefix}:${options.subjectType}:${options.namespace}:${options.subjectHash}:${options.windowLabel}`;
}

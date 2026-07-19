/**
 * Gate A k6 auth request policy — shared expectations for sign-in retries.
 * Pure functions only; safe to mirror in tests without running k6.
 */

export function buildAuthSignInHeaders(anonKey) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
}

export function shouldAbortAuthImmediately(status) {
  return status === 400 || status === 401 || status === 403;
}

export function isTransientAuthStatus(status) {
  return status === 0 || status >= 500;
}

export function maxAuthAttempts() {
  return 3;
}

export function shouldRetryAuth(status, attempt, maxAttempts = maxAuthAttempts()) {
  return isTransientAuthStatus(status) && attempt < maxAttempts;
}

export function authenticationCallsPerVu() {
  return 1;
}

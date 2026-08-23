/**
 * Atomically checks all windows, then increments all or none.
 *
 * KEYS[1..n]   — counter keys (one per window)
 * ARGV pairs   — limit, ttlSeconds per window
 *
 * Returns:
 *   { 1, 0, count1, count2, ... } on allow
 *   { 0, retryAfterSeconds } on block (no writes)
 */
export const MULTI_WINDOW_RATE_LIMIT_LUA = `
local window_count = #KEYS
local max_retry = 0
local blocked = false

for i = 1, window_count do
  local limit = tonumber(ARGV[(i - 1) * 2 + 1])
  local ttl_seconds = tonumber(ARGV[(i - 1) * 2 + 2])
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')

  if current >= limit then
    blocked = true
    local remaining = redis.call('TTL', KEYS[i])
    if remaining == nil or remaining < 0 then
      remaining = ttl_seconds
    end
    if remaining > max_retry then
      max_retry = remaining
    end
  end
end

if blocked then
  if max_retry < 1 then
    max_retry = 1
  end
  return {0, max_retry}
end

local result = {1, 0}
for i = 1, window_count do
  local ttl_seconds = tonumber(ARGV[(i - 1) * 2 + 2])
  local new_count = redis.call('INCR', KEYS[i])
  if new_count == 1 then
    redis.call('EXPIRE', KEYS[i], ttl_seconds)
  else
    local remaining = redis.call('TTL', KEYS[i])
    if remaining == nil or remaining < 0 then
      redis.call('EXPIRE', KEYS[i], ttl_seconds)
    end
  end
  result[#result + 1] = new_count
end

return result
`.trim();

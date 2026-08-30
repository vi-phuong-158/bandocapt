'use strict';

const LOCAL_RATE_LIMITS = new Map();
const KEY_PART_PATTERN = /^[A-Za-z0-9:_-]+$/;
const RATE_LIMIT_SCRIPT = [
    "local raw = redis.call('GET', KEYS[1])",
    "local current = 0",
    "if raw then",
    "  current = tonumber(raw)",
    "  if not current then return redis.error_reply('INVALID_RATE_LIMIT_VALUE') end",
    "end",
    "local limit = tonumber(ARGV[1])",
    "local ttl = tonumber(ARGV[2])",
    "if current >= limit then",
    "  if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ttl) end",
    "  return -current",
    "end",
    "local next = redis.call('INCR', KEYS[1])",
    "if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ttl) end",
    "return next",
].join('\n');

function buildRateLimitKey({ namespace, key, window }) {
    const parts = [namespace, window, key].map(value => String(value || ''));
    if (parts.some(value => !value || !KEY_PART_PATTERN.test(value))) throw new Error('INVALID_RATE_LIMIT_KEY');
    return parts.join(':');
}

function unavailable(resetAt) {
    return { allowed: false, count: 0, remaining: 0, resetAt, reason: 'unavailable' };
}

function localCheckAndIncrement({ key, limit, resetAt }) {
    const current = LOCAL_RATE_LIMITS.get(key) || 0;
    if (current >= limit) return { allowed: false, count: current, remaining: 0, resetAt, reason: 'limit_exceeded' };
    const count = current + 1;
    LOCAL_RATE_LIMITS.set(key, count);
    return { allowed: true, count, remaining: Math.max(0, limit - count), resetAt };
}

async function checkAndIncrement({
    redisUrl,
    redisToken,
    namespace,
    key,
    window,
    limit,
    windowSeconds,
    resetAt,
    allowInMemoryFallback = false,
    fetchImpl = fetch,
}) {
    const redisKey = buildRateLimitKey({ namespace, key, window });
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowSeconds) || windowSeconds <= 0) {
        return unavailable(resetAt);
    }
    if (!redisUrl || !redisToken) {
        return allowInMemoryFallback
            ? localCheckAndIncrement({ key: redisKey, limit, resetAt })
            : unavailable(resetAt);
    }

    try {
        const response = await fetchImpl(String(redisUrl).replace(/\/+$/, ''), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(['EVAL', RATE_LIMIT_SCRIPT, '1', redisKey, String(limit), String(windowSeconds)]),
        });
        if (!response?.ok) return unavailable(resetAt);
        const payload = await response.json();
        const rawCount = typeof payload?.result === 'number'
            ? payload.result
            : (typeof payload?.result === 'string' && /^-?\d+$/.test(payload.result) ? Number(payload.result) : NaN);
        if (!Number.isSafeInteger(rawCount) || rawCount === 0) return unavailable(resetAt);
        if (rawCount < 0) {
            const count = Math.abs(rawCount);
            return { allowed: false, count, remaining: 0, resetAt, reason: 'limit_exceeded' };
        }
        const count = rawCount;
        if (count > limit) return unavailable(resetAt);
        return { allowed: true, count, remaining: Math.max(0, limit - count), resetAt };
    } catch (_) {
        return unavailable(resetAt);
    }
}

function clearLocalRateLimitStore() {
    LOCAL_RATE_LIMITS.clear();
}

module.exports = {
    RATE_LIMIT_SCRIPT,
    buildRateLimitKey,
    checkAndIncrement,
    clearLocalRateLimitStore,
};

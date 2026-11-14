interface RateLimitBucket {
  count: number
  resetAt: number
  lastRequestAt: number
}

interface GlobalRateLimitState {
  buckets: Map<string, RateLimitBucket>
  stkInitiatedTimestamps: Map<string, number>
}

const globalForRateLimit = globalThis as unknown as {
  __luminousRateLimit?: GlobalRateLimitState
}

function getRateLimitState(): GlobalRateLimitState {
  if (!globalForRateLimit.__luminousRateLimit) {
    globalForRateLimit.__luminousRateLimit = {
      buckets: new Map<string, RateLimitBucket>(),
      stkInitiatedTimestamps: new Map<string, number>(),
    }
  }
  return globalForRateLimit.__luminousRateLimit
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  options: {
    maxRequests: number
    windowMs: number
    minIntervalMs?: number
  }
): RateLimitResult {
  const { buckets } = getRateLimitState()
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
      lastRequestAt: now,
    })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (options.minIntervalMs && now - existing.lastRequestAt < options.minIntervalMs) {
    const waitMs = options.minIntervalMs - (now - existing.lastRequestAt)
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    }
  }

  if (existing.count >= options.maxRequests) {
    const waitMs = existing.resetAt - now
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    }
  }

  existing.count += 1
  existing.lastRequestAt = now
  buckets.set(key, existing)

  return { allowed: true, retryAfterSeconds: 0 }
}

export function markStkPushInitiated(orderId: string) {
  const { stkInitiatedTimestamps } = getRateLimitState()
  stkInitiatedTimestamps.set(orderId, Date.now())
}

export function isWithinStkDeliveryGracePeriod(orderId: string, graceMs = 25000): boolean {
  const { stkInitiatedTimestamps } = getRateLimitState()
  const initiatedAt = stkInitiatedTimestamps.get(orderId)
  if (!initiatedAt) return false
  return Date.now() - initiatedAt < graceMs
}
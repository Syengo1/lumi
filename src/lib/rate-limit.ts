interface RateLimitBucket {
  count: number
  resetAt: number
  lastRequestAt: number
}

interface GlobalRateLimitState {
  buckets: Map<string, RateLimitBucket>
  stkInitiatedTimestamps: Map<string, number>
  lastAutoQueryTimestamps: Map<string, number>
}

const globalForRateLimit = globalThis as unknown as {
  __luminousRateLimit?: Partial<GlobalRateLimitState>
}

function getRateLimitState(): GlobalRateLimitState {
  const existing = globalForRateLimit.__luminousRateLimit || {}
  const state: GlobalRateLimitState = {
    buckets:
      existing.buckets instanceof Map
        ? existing.buckets
        : new Map<string, RateLimitBucket>(),
    stkInitiatedTimestamps:
      existing.stkInitiatedTimestamps instanceof Map
        ? existing.stkInitiatedTimestamps
        : new Map<string, number>(),
    lastAutoQueryTimestamps:
      existing.lastAutoQueryTimestamps instanceof Map
        ? existing.lastAutoQueryTimestamps
        : new Map<string, number>(),
  }
  globalForRateLimit.__luminousRateLimit = state
  return state
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function canProceedRateLimit(
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

  return { allowed: true, retryAfterSeconds: 0 }
}

export function commitRateLimit(key: string, windowMs: number): void {
  const { buckets } = getRateLimitState()
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
      lastRequestAt: now,
    })
    return
  }

  existing.count += 1
  existing.lastRequestAt = now
  buckets.set(key, existing)
}

export function checkRateLimit(
  key: string,
  options: {
    maxRequests: number
    windowMs: number
    minIntervalMs?: number
  }
): RateLimitResult {
  const check = canProceedRateLimit(key, options)
  if (!check.allowed) return check
  commitRateLimit(key, options.windowMs)
  return { allowed: true, retryAfterSeconds: 0 }
}

export function markStkPushInitiated(orderId: string) {
  const { stkInitiatedTimestamps, lastAutoQueryTimestamps } = getRateLimitState()
  const now = Date.now()
  stkInitiatedTimestamps.set(orderId, now)
  lastAutoQueryTimestamps.set(orderId, now)
}

export function recordOrderQueryAttempt(orderId: string) {
  const { lastAutoQueryTimestamps } = getRateLimitState()
  lastAutoQueryTimestamps.set(orderId, Date.now())
}

/**
 * Runs a single background Daraja reconciliation check at +90s if the webhook callback
 * hasn't arrived yet. During the first 90s, background polls only check Supabase.
 */
export function shouldRunScheduledDarajaQuery(
  orderId: string,
  lastInitiatedIso: string,
  graceMs = 90000,
  intervalMs = 60000
): boolean {
  const { stkInitiatedTimestamps, lastAutoQueryTimestamps } = getRateLimitState()
  const now = Date.now()

  const parsedMs = Date.parse(lastInitiatedIso)
  const dbInitiatedMs = Number.isFinite(parsedMs) ? parsedMs : 0
  const memInitiatedMs = stkInitiatedTimestamps.get(orderId) || 0
  const initiatedAt = Math.max(dbInitiatedMs, memInitiatedMs)

  if (now - initiatedAt < graceMs) {
    return false
  }

  const lastQueryAt = Math.max(lastAutoQueryTimestamps.get(orderId) || 0, initiatedAt)
  if (now - lastQueryAt < intervalMs) {
    return false
  }

  lastAutoQueryTimestamps.set(orderId, now)
  return true
}
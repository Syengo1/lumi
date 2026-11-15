const DARAJA_ENV = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox'
const BASE_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'

interface DarajaGlobalCache {
  cachedToken: { value: string; expiresAt: number } | null
  inFlightTokenPromise: Promise<string> | null
  lastApiCallAt: number
  backoffUntil: number
  apiQueuePromise: Promise<void>
}

const globalForDaraja = globalThis as unknown as {
  __luminousDarajaCache?: Partial<DarajaGlobalCache>
}

function getDarajaCache(): DarajaGlobalCache {
  const existing = globalForDaraja.__luminousDarajaCache || {}

  const cache: DarajaGlobalCache = {
    cachedToken: existing.cachedToken ?? null,
    inFlightTokenPromise: existing.inFlightTokenPromise ?? null,
    lastApiCallAt: typeof existing.lastApiCallAt === 'number' ? existing.lastApiCallAt : 0,
    backoffUntil: typeof existing.backoffUntil === 'number' ? existing.backoffUntil : 0,
    apiQueuePromise:
      existing.apiQueuePromise && typeof existing.apiQueuePromise.then === 'function'
        ? existing.apiQueuePromise
        : Promise.resolve(),
  }

  globalForDaraja.__luminousDarajaCache = cache
  return cache
}

export function getDarajaBackoffRemainingSeconds(): number {
  const cache = getDarajaCache()
  const remainingMs = cache.backoffUntil - Date.now()
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
}

/**
 * Serializes outbound calls with a short minimum gap (2.2s) without sleeping for 35s+ backoffs
 */
async function paceDarajaRequest(minGapMs = 2200): Promise<void> {
  const cache = getDarajaCache()
  const previousQueue =
    cache.apiQueuePromise && typeof cache.apiQueuePromise.then === 'function'
      ? cache.apiQueuePromise
      : Promise.resolve()

  const nextTurn = previousQueue
    .catch(() => {})
    .then(async () => {
      const elapsed = Date.now() - (cache.lastApiCallAt || 0)
      if (elapsed < minGapMs) {
        await new Promise((resolve) => setTimeout(resolve, minGapMs - elapsed))
      }
      cache.lastApiCallAt = Date.now()
    })

  cache.apiQueuePromise = nextTurn
  return nextTurn
}

export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('07') && digits.length === 10) {
    return `254${digits.slice(1)}`
  }
  if (digits.startsWith('01') && digits.length === 10) {
    return `254${digits.slice(1)}`
  }
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    return `254${digits}`
  }
  if (digits.startsWith('254') && digits.length === 12) {
    return digits
  }
  throw new Error(
    'Enter a valid Kenyan M-Pesa phone number (e.g., 0712 345 678 or 0114 513 647).'
  )
}

export function getDarajaTimestamp(): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const map: Record<string, string> = {}
  for (const part of formatter.formatToParts(new Date())) {
    map[part.type] = part.value
  }

  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`
}

export async function getDarajaAccessToken(forceRefresh = false): Promise<string> {
  const cache = getDarajaCache()
  const now = Date.now()

  if (!forceRefresh && cache.cachedToken && now < cache.cachedToken.expiresAt) {
    return cache.cachedToken.value
  }

  if (!forceRefresh && cache.inFlightTokenPromise) {
    return cache.inFlightTokenPromise
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY?.trim()
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET?.trim()

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      'M-Pesa Daraja credentials (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET) are missing in .env.local'
    )
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  cache.inFlightTokenPromise = (async () => {
    try {
      await paceDarajaRequest(1500)

      const response = await fetch(
        `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(12000),
        }
      )

      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          throw new Error(
            `Daraja OAuth rejected credentials (HTTP ${response.status}). Ensure MPESA_ENV (${DARAJA_ENV}) matches your Consumer Key & Secret.`
          )
        }
        throw new Error(`Daraja OAuth failed with HTTP ${response.status}`)
      }

      const data = (await response.json()) as { access_token: string; expires_in?: string }
      const ttlSeconds = Math.max(60, (parseInt(data.expires_in || '3599', 10) || 3599) - 600)

      cache.cachedToken = {
        value: data.access_token,
        expiresAt: Date.now() + ttlSeconds * 1000,
      }

      return data.access_token
    } finally {
      cache.inFlightTokenPromise = null
    }
  })()

  return cache.inFlightTokenPromise
}

export function resolveValidCallbackUrl(): string {
  const rawUrl = (
    process.env.MPESA_CALLBACK_URL ||
    `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/daraja/callback`
  ).trim()

  if (
    !rawUrl.startsWith('https://') ||
    rawUrl.includes('localhost') ||
    rawUrl.includes('127.0.0.1')
  ) {
    throw new Error(
      'MPESA_CALLBACK_URL must be a publicly accessible HTTPS URL (e.g., https://lumi-gules.vercel.app/api/daraja/callback).'
    )
  }

  return rawUrl
}

export interface InitiateStkPushParams {
  phone: string
  amount: number
  orderNumber: string
  description?: string
}

export interface StkPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

export async function initiateDarajaStkPush({
  phone,
  amount,
  orderNumber,
  description = 'LuminousDrip',
}: InitiateStkPushParams): Promise<StkPushResponse> {
  const formattedPhone = normalizeKenyanPhone(phone)
  const shortcode = (process.env.MPESA_SHORTCODE || '174379').trim()
  const partyB = (process.env.MPESA_PARTY_B || shortcode).trim()
  const passkey = (
    process.env.MPESA_PASSKEY ||
    'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
  ).trim()

  const callbackUrl = resolveValidCallbackUrl()
  const transactionType =
    process.env.MPESA_TRANSACTION_TYPE === 'CustomerBuyGoodsOnline'
      ? 'CustomerBuyGoodsOnline'
      : 'CustomerPayBillOnline'

  const cleanAccountRef =
    orderNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'LUMINOUS'
  const cleanDesc =
    description.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'OrderPay'

  const useFullSandboxAmount = process.env.MPESA_SANDBOX_USE_FULL_AMOUNT === 'true'
  const billedAmount =
    DARAJA_ENV === 'sandbox' && !useFullSandboxAmount
      ? 1
      : Math.max(1, Math.round(amount))

  const token = await getDarajaAccessToken()
  await paceDarajaRequest(2200)

  const timestamp = getDarajaTimestamp()
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: billedAmount,
    PartyA: formattedPhone,
    PartyB: partyB,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: cleanAccountRef,
    TransactionDesc: cleanDesc,
  }

  console.info('[Daraja STK Push Request]', {
    ...payload,
    Password: '[REDACTED]',
  })

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })

  const rawText = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(rawText)
  } catch {
    throw new Error(`Daraja returned non-JSON response (HTTP ${res.status})`)
  }

  console.info(`[Daraja STK Push Response HTTP ${res.status}]`, data)

  if (!res.ok || String(data.ResponseCode) !== '0') {
    const errCode = String(data.errorCode || '')
    const rawErrMsg = String(
      data.errorMessage || data.ResponseDescription || 'Safaricom Daraja rejected the STK push.'
    )
    throw new Error(`${rawErrMsg}${errCode ? ` (${errCode})` : ''}`)
  }

  return data as unknown as StkPushResponse
}

export interface NormalizedDarajaQueryResult {
  state:
    | 'succeeded'
    | 'pending'
    | 'failed'
    | 'cancelled'
    | 'timed_out'
    | 'rate_limited'
    | 'upstream_error'
  httpStatus: number
  resultCode: string | null
  description: string
}

export async function queryDarajaStkStatus(
  checkoutRequestId: string
): Promise<NormalizedDarajaQueryResult> {
  // Fail-fast circuit breaker: never sleep inside a server action if Daraja is in a 429 cooldown
  const backoffSecs = getDarajaBackoffRemainingSeconds()
  if (backoffSecs > 0) {
    return {
      state: 'rate_limited',
      httpStatus: 429,
      resultCode: '429',
      description: `Safaricom Sandbox query rate limit active. Please wait ${backoffSecs}s (or await automatic webhook confirmation).`,
    }
  }

  const shortcode = (process.env.MPESA_SHORTCODE || '174379').trim()
  const passkey = (
    process.env.MPESA_PASSKEY ||
    'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
  ).trim()

  const token = await getDarajaAccessToken()
  await paceDarajaRequest(3000)

  const timestamp = getDarajaTimestamp()
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

  const queryPayload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  }

  console.info('[Daraja STK Query Request]', {
    ...queryPayload,
    Password: '[REDACTED]',
  })

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(queryPayload),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })

  const rawText = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(rawText)
  } catch {
    data = { rawError: rawText }
  }

  console.info(`[Daraja STK Query Response HTTP ${res.status}]`, data)

  // 1. Explicit HTTP 429 Spike Arrest handling with 45s fail-fast circuit breaker
  const hasSpikeArrest =
    res.status === 429 ||
    Boolean((data.fault as Record<string, unknown> | undefined)?.faultstring)

  if (hasSpikeArrest) {
    getDarajaCache().backoffUntil = Date.now() + 45000
    return {
      state: 'rate_limited',
      httpStatus: res.status,
      resultCode: '429',
      description:
        'Safaricom Sandbox query rate limit reached (HTTP 429 on shared shortcode 174379). Backing off for 45s while awaiting webhook callback.',
    }
  }

  // 2. Explicit Upstream Error handling (e.g., 500.001.1001)
  const errorCode = data.errorCode ? String(data.errorCode) : null
  if (errorCode) {
    // Also pause queries for 25s when 500.001.1001 is returned so we don't spam the upstream switch
    getDarajaCache().backoffUntil = Date.now() + 25000
    const errorMsg = data.errorMessage ? String(data.errorMessage) : 'Transaction still in progress on switch'
    return {
      state: 'upstream_error',
      httpStatus: res.status,
      resultCode: errorCode,
      description: `Safaricom switch status (${errorCode}): ${errorMsg}. Enter your M-Pesa PIN on your phone if prompted.`,
    }
  }

  // 3. Definitive Transaction ResultCodes
  const resultCodeStr =
    data.ResultCode !== undefined ? String(data.ResultCode) : null

  if (resultCodeStr === '0') {
    return {
      state: 'succeeded',
      httpStatus: res.status,
      resultCode: '0',
      description: String(data.ResultDesc || 'The service request is processed successfully.'),
    }
  }

  if (resultCodeStr === '1032') {
    return {
      state: 'cancelled',
      httpStatus: res.status,
      resultCode: '1032',
      description: 'Code 1032: Request cancelled by customer on handset.',
    }
  }

  if (resultCodeStr === '1037' || resultCodeStr === '1019') {
    return {
      state: 'timed_out',
      httpStatus: res.status,
      resultCode: resultCodeStr,
      description:
        resultCodeStr === '1037'
          ? 'Code 1037 (DS timeout): Customer handset could not be reached.'
          : 'Code 1019: Transaction expired before completion.',
    }
  }

  const otherFailureCodes = new Set(['1', '2001', '1025'])
  if (resultCodeStr && otherFailureCodes.has(resultCodeStr)) {
    return {
      state: 'failed',
      httpStatus: res.status,
      resultCode: resultCodeStr,
      description: String(data.ResultDesc || `Transaction failed (Code ${resultCodeStr}).`),
    }
  }

  return {
    state: 'pending',
    httpStatus: res.status,
    resultCode: resultCodeStr,
    description: String(data.ResultDesc || 'Transaction pending completion.'),
  }
}
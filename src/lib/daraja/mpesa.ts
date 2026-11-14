const DARAJA_ENV = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox'
const BASE_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'

interface DarajaGlobalCache {
  cachedToken: { value: string; expiresAt: number } | null
  inFlightTokenPromise: Promise<string> | null
  lastApiCallAt: number
  apiQueuePromise: Promise<void>
}

const globalForDaraja = globalThis as unknown as {
  __luminousDarajaCache?: Partial<DarajaGlobalCache>
}

/**
 * Self-healing global cache that safely upgrades existing HMR objects in Next.js Turbopack
 */
function getDarajaCache(): DarajaGlobalCache {
  const existing = globalForDaraja.__luminousDarajaCache || {}

  const cache: DarajaGlobalCache = {
    cachedToken: existing.cachedToken ?? null,
    inFlightTokenPromise: existing.inFlightTokenPromise ?? null,
    lastApiCallAt: typeof existing.lastApiCallAt === 'number' ? existing.lastApiCallAt : 0,
    apiQueuePromise:
      existing.apiQueuePromise && typeof existing.apiQueuePromise.then === 'function'
        ? existing.apiQueuePromise
        : Promise.resolve(),
  }

  globalForDaraja.__luminousDarajaCache = cache
  return cache
}

/**
 * Serializes and paces outbound calls to Safaricom Daraja to stay below
 * Apigee's Spike Arrest limit (30 req / 60s = 1 req per 2,000ms, maxBurst=3).
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
      const now = Date.now()
      const elapsed = now - (cache.lastApiCallAt || 0)
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
  const now = new Date()
  const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    eatTime.getUTCFullYear().toString() +
    pad(eatTime.getUTCMonth() + 1) +
    pad(eatTime.getUTCDate()) +
    pad(eatTime.getUTCHours()) +
    pad(eatTime.getUTCMinutes()) +
    pad(eatTime.getUTCSeconds())
  )
}

export async function getDarajaAccessToken(): Promise<string> {
  const cache = getDarajaCache()
  const now = Date.now()

  if (cache.cachedToken && now < cache.cachedToken.expiresAt) {
    return cache.cachedToken.value
  }

  if (cache.inFlightTokenPromise) {
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
      await paceDarajaRequest(1200)

      const response = await fetch(
        `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        }
      )

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Daraja OAuth failed (${response.status}): ${errText}`)
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
    return 'https://luminousdrip.co.ke/api/daraja/callback'
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
    description.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 13) || 'OrderPay'

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

  console.info(
    `[Daraja STK Push] Sending prompt to +${formattedPhone} | Billed: KES ${billedAmount} (Order: KES ${amount}) | Ref: ${cleanAccountRef} | Callback: ${callbackUrl}`
  )

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
    throw new Error(`Daraja returned non-JSON response (${res.status}): ${rawText.slice(0, 120)}`)
  }

  console.info('[Daraja STK Response]', data)

  if (!res.ok || String(data.ResponseCode) !== '0') {
    const errMsg =
      (data.errorMessage as string) ||
      (data.ResponseDescription as string) ||
      'Safaricom Daraja rejected the STK push request.'
    throw new Error(errMsg)
  }

  return data as unknown as StkPushResponse
}

export interface NormalizedDarajaQueryResult {
  state: 'paid' | 'pending' | 'failed'
  resultCode: string | null
  description: string
}

export async function queryDarajaStkStatus(
  checkoutRequestId: string
): Promise<NormalizedDarajaQueryResult> {
  const shortcode = (process.env.MPESA_SHORTCODE || '174379').trim()
  const passkey = (
    process.env.MPESA_PASSKEY ||
    'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
  ).trim()

  const token = await getDarajaAccessToken()
  await paceDarajaRequest(2500)

  const timestamp = getDarajaTimestamp()
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
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

  console.info(`[Daraja STK Query] (${checkoutRequestId}) ->`, data)

  const errorCode = data.errorCode ? String(data.errorCode) : ''
  const hasSpikeArrest = Boolean(
    (data.fault as Record<string, unknown> | undefined)?.faultstring
  )

  if (errorCode === '500.001.1001' || errorCode === '4999' || hasSpikeArrest) {
    return {
      state: 'pending',
      resultCode: errorCode || 'PROCESSING',
      description:
        'Safaricom is still processing the STK Push in the USSD queue (Code 500.001.1001). Enter your PIN if prompted, or use Resend / Simulate below.',
    }
  }

  const resultCodeStr =
    data.ResultCode !== undefined ? String(data.ResultCode) : null

  if (resultCodeStr === '0') {
    return {
      state: 'paid',
      resultCode: '0',
      description: String(data.ResultDesc || 'Confirmed via Daraja STK Query'),
    }
  }

  const terminalFailureCodes = new Set(['1', '1032', '1037', '1019', '2001', '1025'])
  if (resultCodeStr && terminalFailureCodes.has(resultCodeStr)) {
    const friendlyDesc =
      resultCodeStr === '1037'
        ? 'Code 1037 (SIM Unreachable): Safaricom could not reach the SIM Toolkit on your handset. Dial *334# once and exit to wake up the SIM, then click Resend.'
        : resultCodeStr === '1032'
        ? 'Code 1032: The M-Pesa prompt was cancelled on the phone.'
        : resultCodeStr === '1'
        ? 'Code 1: Insufficient M-Pesa balance.'
        : String(data.ResultDesc || 'M-Pesa transaction did not complete.')

    return {
      state: 'failed',
      resultCode: resultCodeStr,
      description: friendlyDesc,
    }
  }

  return {
    state: 'pending',
    resultCode: resultCodeStr,
    description: String(data.ResultDesc || 'Awaiting PIN confirmation on handset.'),
  }
}
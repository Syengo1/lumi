// Run in PowerShell: node scripts/test-mpesa-cli.mjs 254708374149
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

// Default to Safaricom's official sandbox test MSISDN (254708374149) unless a number is passed
const rawPhone = process.argv[2] || '254708374149'
const digits = rawPhone.replace(/\D/g, '')
const phone =
  digits.startsWith('0') && digits.length === 10
    ? `254${digits.slice(1)}`
    : digits.startsWith('254') && digits.length === 12
    ? digits
    : `254${digits}`

const env = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox'
const baseUrl =
  env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'

const consumerKey = (process.env.MPESA_CONSUMER_KEY || '').trim()
const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || '').trim()
const shortcode = (process.env.MPESA_SHORTCODE || '174379').trim()
const passkey = (
  process.env.MPESA_PASSKEY ||
  'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
).trim()
const callbackUrl = (
  process.env.MPESA_CALLBACK_URL || 'https://lumi-gules.vercel.app/api/daraja/callback'
).trim()

function getEatTimestamp() {
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
  const map = {}
  for (const part of formatter.formatToParts(new Date())) {
    map[part.type] = part.value
  }
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`
}

async function runDiagnostics() {
  console.log('\n================================================================')
  console.log(' LUMINOUS DRIP LINE - DARAJA STAGE 1 & STAGE 2 DIAGNOSTIC CLI')
  console.log('================================================================')
  console.log(`Target MSISDN    : +${phone}`)
  console.log(`Daraja Env       : ${env} (${baseUrl})`)
  console.log(`ShortCode        : ${shortcode}`)
  console.log(`Callback URL     : ${callbackUrl}`)

  // STEP 1: OAuth (Token Redacted)
  console.log('\n--- [STEP 1/3] Requesting Daraja OAuth Access Token ---')
  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
  const oauthStart = Date.now()
  const oauthRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${authHeader}` },
  })
  const oauthData = await oauthRes.json()
  console.log(`OAuth HTTP ${oauthRes.status} (${Date.now() - oauthStart}ms):`, {
    access_token: oauthData.access_token ? '[REDACTED_BEARER_TOKEN]' : null,
    expires_in: oauthData.expires_in,
  })
  if (!oauthRes.ok || !oauthData.access_token) process.exit(1)
  const token = oauthData.access_token

  // STEP 2: STK Push Initiation (Password Redacted)
  console.log('\n--- [STEP 2/3] Sending STK Push (/mpesa/stkpush/v1/processrequest) ---')
  const stkTimestamp = getEatTimestamp()
  const stkPassword = Buffer.from(`${shortcode}${passkey}${stkTimestamp}`).toString('base64')
  const stkPayload = {
    BusinessShortCode: shortcode,
    Password: stkPassword,
    Timestamp: stkTimestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: 1,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: 'LUMINOUS01',
    TransactionDesc: 'OrderPay',
  }

  console.log('Outgoing STK Push Payload (Password Masked):\n', {
    ...stkPayload,
    Password: `[REDACTED_BASE64_LEN_${stkPassword.length}]`,
  })

  const stkStart = Date.now()
  const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(stkPayload),
  })
  const stkJson = await stkRes.json()
  console.log(`\nStage 1 Acknowledgement HTTP ${stkRes.status} (${Date.now() - stkStart}ms):\n`, stkJson)

  if (String(stkJson.ResponseCode) !== '0') {
    process.exit(1)
  }

  const checkoutReqId = stkJson.CheckoutRequestID

  // STEP 3: Single Non-Burst STK Query Inspection after 35s
  console.log('\n--- [STEP 3/3] Waiting 35s before single /stkpushquery inspection ---')
  await new Promise((r) => setTimeout(r, 35000))

  const queryTimestamp = getEatTimestamp()
  const queryPassword = Buffer.from(`${shortcode}${passkey}${queryTimestamp}`).toString('base64')
  const queryPayload = {
    BusinessShortCode: shortcode,
    Password: queryPassword,
    Timestamp: queryTimestamp,
    CheckoutRequestID: checkoutReqId,
  }

  console.log('Outgoing STK Query Payload (Password Masked):\n', {
    ...queryPayload,
    Password: `[REDACTED_BASE64_LEN_${queryPassword.length}]`,
     timestampMatchesPassword: queryPassword === Buffer.from(`${shortcode}${passkey}${queryPayload.Timestamp}`).toString('base64'),
  })

  const qRes = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(queryPayload),
  })
  const qText = await qRes.text()
  console.log(`\nIncoming STK Query Response HTTP ${qRes.status}:\n`, qText)
}

runDiagnostics().catch((err) => console.error('Diagnostic error:', err))
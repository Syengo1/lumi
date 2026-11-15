'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import {
  initiateDarajaStkPush,
  normalizeKenyanPhone,
  queryDarajaStkStatus,
} from '@/lib/daraja/mpesa'
import {
  canProceedRateLimit,
  checkRateLimit,
  commitRateLimit,
  markStkPushInitiated,
  recordOrderQueryAttempt,
  shouldRunScheduledDarajaQuery,
} from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Valid Safaricom M-Pesa receipt: 10 alphanumeric chars, starts with a letter, contains at least one digit
const MPESA_RECEIPT_REGEX = /^(?=.*[0-9])[A-Z][A-Z0-9]{9}$/

function isValidUuid(id: string): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()))
}

/**
 * Derives the timestamp of the most recent STK push attempt from payment_expires_at
 * (which is set to initiated_at + 120s in PostgreSQL), ensuring resends get a full
 * grace period across all serverless workers.
 */
function resolveLastStkInitiatedIso(
  paymentExpiresAt: string | null | undefined,
  createdAt: string
): string {
  if (paymentExpiresAt) {
    const expiresMs = Date.parse(paymentExpiresAt)
    if (Number.isFinite(expiresMs)) {
      return new Date(expiresMs - 120 * 1000).toISOString()
    }
  }
  return createdAt
}

export async function checkCustomerOrderPaymentStatus(
  orderId: string,
  forceDarajaQuery = false
) {
  if (!isValidUuid(orderId)) {
    return { error: 'Invalid order identifier.' }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select(
      'id, order_number, payment_status, order_status, mpesa_receipt_number, mpesa_result_desc, mpesa_checkout_request_id, payment_expires_at, customer_phone, total_amount, created_at'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (fetchError || !order) {
    return { error: 'Order not found.' }
  }

  // 1. If already paid, failed, or cancelled in DB, return immediately without calling Daraja
  if (
    order.payment_status === 'paid' ||
    order.payment_status === 'failed' ||
    order.order_status === 'cancelled'
  ) {
    return { order }
  }

  // 2. If there is no active Daraja CheckoutRequestID on this order, do not call Daraja or burn rate limits
  const hasValidCheckoutId =
    Boolean(order.mpesa_checkout_request_id) &&
    !order.mpesa_checkout_request_id!.startsWith('RETRY-')

  if (!hasValidCheckoutId) {
    return {
      order,
      gatewayMessage: forceDarajaQuery
        ? 'No active STK Push session was found for this order. Click "Resend M-Pesa Prompt" to trigger a new pop-up.'
        : undefined,
    }
  }

  // 3. Background polls ONLY check Supabase during the first 90s (relying on the webhook + Realtime).
  // Only run a single automatic Daraja fallback query at +90s if the webhook hasn't arrived.
  if (!forceDarajaQuery) {
    const lastInitiatedIso = resolveLastStkInitiatedIso(
      order.payment_expires_at,
      order.created_at
    )
    const shouldAutoQuery = shouldRunScheduledDarajaQuery(
      order.id,
      lastInitiatedIso,
      90000,
      60000
    )
    if (!shouldAutoQuery) {
      return { order }
    }
  }

  // 4. Rate limit manual Daraja stkpushquery to at most 1 call every 30 seconds per order
  const queryLimit = checkRateLimit(`stk_query_${order.id}`, {
    maxRequests: 3,
    windowMs: 120 * 1000,
    minIntervalMs: 30000,
  })

  if (!queryLimit.allowed) {
    return {
      order,
      gatewayMessage: forceDarajaQuery
        ? `Please wait ${queryLimit.retryAfterSeconds}s before querying Safaricom again (or wait for automatic webhook confirmation).`
        : undefined,
    }
  }

  recordOrderQueryAttempt(order.id)

  let gatewayMessage: string | undefined

  try {
    const queryResult = await queryDarajaStkStatus(order.mpesa_checkout_request_id!)
    const state = String(queryResult.state)
    gatewayMessage = queryResult.description

    const isSuccess = state === 'paid' || state === 'succeeded'
    const isTerminalFailure =
      state === 'failed' || state === 'cancelled' || state === 'timed_out'

    if (isSuccess) {
      const { data: finalizedId, error: rpcError } = await supabase.rpc(
        'finalize_order_mpesa_payment',
        {
          target_order_id: order.id,
          checkout_req_id: order.mpesa_checkout_request_id,
          result_code: 0,
          result_desc: queryResult.description,
          receipt_num: null,
        }
      )

      if (rpcError || !finalizedId) {
        console.error(
          '[Order Finalize RPC Error]:',
          rpcError?.message || 'Order not updated'
        )
      }

      revalidatePath(`/orders/${orderId}`)
      revalidatePath('/orders')
      revalidatePath('/dashboard')
      revalidatePath('/inventory')
    } else if (isTerminalFailure) {
      const { data: finalizedId, error: rpcError } = await supabase.rpc(
        'finalize_order_mpesa_payment',
        {
          target_order_id: order.id,
          checkout_req_id: order.mpesa_checkout_request_id,
          result_code: Number(queryResult.resultCode) || 1,
          result_desc: queryResult.description,
          receipt_num: null,
        }
      )

      if (rpcError || !finalizedId) {
        console.error(
          '[Order Fail RPC Error]:',
          rpcError?.message || 'Order not updated'
        )
      }

      revalidatePath(`/orders/${orderId}`)
      revalidatePath('/orders')
    }
  } catch (err) {
    gatewayMessage =
      err instanceof Error
        ? err.message
        : 'Safaricom Daraja query timed out. Try again in a few seconds.'
  }

  const { data: refreshed } = await supabase
    .from('orders')
    .select(
      'id, order_number, payment_status, order_status, mpesa_receipt_number, mpesa_result_desc, mpesa_checkout_request_id, payment_expires_at, customer_phone, total_amount, created_at'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  return { order: refreshed || order, gatewayMessage }
}

export async function resendCustomerStkPush(orderId: string, newPhone?: string) {
  if (!isValidUuid(orderId)) {
    return { error: 'Invalid order identifier.' }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, order_number, customer_phone, total_amount, payment_status, order_status, payment_expires_at, mpesa_checkout_request_id, mpesa_merchant_request_id'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  if (order.payment_status === 'paid') {
    return { error: 'This order has already been paid.' }
  }

  if (order.order_status === 'dispatched' || order.order_status === 'delivered') {
    return { error: `This order is already ${order.order_status}.` }
  }

  let phoneToUse = order.customer_phone
  if (newPhone && newPhone.trim() !== '') {
    try {
      phoneToUse = normalizeKenyanPhone(newPhone)
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Invalid M-Pesa phone number.',
      }
    }
  }

  // Phase 1: Check cooldown BEFORE calling Daraja so we don't collide with an open USSD session
  const rateCheck = canProceedRateLimit(`stk_phone_${phoneToUse}`, {
    maxRequests: 4,
    windowMs: 5 * 60 * 1000,
    minIntervalMs: 35 * 1000,
  })

  if (!rateCheck.allowed) {
    return {
      error: `Please wait ${rateCheck.retryAfterSeconds}s before requesting another M-Pesa prompt on +${phoneToUse} (Safaricom USSD session lock cooldown).`,
    }
  }

  try {
    const stk = await initiateDarajaStkPush({
      phone: phoneToUse,
      amount: Number(order.total_amount),
      orderNumber: order.order_number,
      description: 'OrderRetry',
    })

    // Phase 2: Commit rate limit ONLY after Daraja accepts the push
    commitRateLimit(`stk_phone_${phoneToUse}`, 5 * 60 * 1000)
    markStkPushInitiated(order.id)

    const newExpiresAt = new Date(Date.now() + 120 * 1000).toISOString()

    const { data: attachedOk, error: rpcError } = await supabase.rpc(
      'attach_order_stk_request',
      {
        target_order_id: order.id,
        target_store_id: storeId,
        checkout_req_id: stk.CheckoutRequestID,
        merchant_req_id: stk.MerchantRequestID,
        result_desc: stk.CustomerMessage,
        updated_phone: phoneToUse,
      }
    )

    if (rpcError || attachedOk === false) {
      return {
        error: `STK Push sent, but failed to update order record: ${
          rpcError?.message || 'Order row could not be locked'
        }`,
      }
    }

    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')

    return {
      success: true,
      checkoutRequestId: stk.CheckoutRequestID,
      message: `Fresh STK Push sent to +${phoneToUse}. Keep your phone screen unlocked!`,
      payment_expires_at: newExpiresAt,
      customer_phone: phoneToUse,
    }
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : 'Could not reach Safaricom Daraja. Please verify your Daraja API keys.'

    // Preserve any existing CheckoutRequestID so an in-flight STK session is never overwritten with null
    await supabase.rpc('attach_order_stk_request', {
      target_order_id: order.id,
      target_store_id: storeId,
      checkout_req_id: order.mpesa_checkout_request_id || null,
      merchant_req_id: order.mpesa_merchant_request_id || null,
      result_desc: order.mpesa_checkout_request_id
        ? `Retry note: ${errMsg}`
        : `STK Error: ${errMsg}`,
      updated_phone: phoneToUse,
    })

    revalidatePath(`/orders/${orderId}`)
    return {
      error: errMsg,
      payment_expires_at: order.payment_expires_at || undefined,
      customer_phone: phoneToUse,
    }
  }
}

export async function submitCustomerMpesaReceiptCode(
  orderId: string,
  receiptCode: string
) {
  if (!isValidUuid(orderId)) {
    return { error: 'Invalid order identifier.' }
  }

  const cleaned = (receiptCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!MPESA_RECEIPT_REGEX.test(cleaned)) {
    return {
      error:
        'Enter a valid 10-character M-Pesa transaction code from your SMS (e.g., SJK8912XYZ).',
    }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, mpesa_checkout_request_id, payment_status, order_status, mpesa_receipt_number'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  if (order.payment_status === 'paid') {
    return { success: true, receipt: order.mpesa_receipt_number || cleaned }
  }

  if (order.order_status === 'cancelled') {
    return {
      error:
        'This order was cancelled. Please place a new order from your checkout page.',
    }
  }

  // Prevent duplicate M-Pesa receipt code reuse across orders
  const { data: duplicateOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .eq('mpesa_receipt_number', cleaned)
    .neq('id', orderId)
    .maybeSingle()

  if (duplicateOrder) {
    return {
      error: `M-Pesa receipt code ${cleaned} has already been used on another order.`,
    }
  }

  const { data: finalizedId, error: rpcError } = await supabase.rpc(
    'finalize_order_mpesa_payment',
    {
      target_order_id: order.id,
      checkout_req_id: order.mpesa_checkout_request_id,
      result_code: 0,
      result_desc: `Customer submitted M-Pesa Receipt Code (${cleaned})`,
      receipt_num: cleaned,
    }
  )

  if (rpcError || !finalizedId) {
    return {
      error: `Could not verify receipt code: ${
        rpcError?.message || 'Order update failed'
      }`,
    }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  revalidatePath('/inventory')

  return {
    success: true,
    receipt: cleaned,
  }
}

export async function cancelCustomerPendingOrder(orderId: string) {
  if (!isValidUuid(orderId)) {
    return { error: 'Invalid order identifier.' }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: ok, error } = await supabase.rpc('customer_cancel_pending_order', {
    target_order_id: orderId,
    target_store_id: storeId,
  })

  if (error || !ok) {
    return {
      error: 'Could not cancel this order (it may already be paid or processed).',
    }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { success: true }
}
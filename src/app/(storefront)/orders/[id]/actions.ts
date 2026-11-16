'use server'

import { revalidatePath } from 'next/cache'
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import {
  initiateDarajaStkPush,
  normalizeKenyanPhone,
  queryDarajaStkStatus,
} from '@/lib/daraja/mpesa'
import {
  canProceedRateLimit,
  checkRateLimit,
  clearRateLimit,
  commitRateLimit,
  markStkPushInitiated,
  shouldRunScheduledDarajaQuery,
} from '@/lib/rate-limit'

export interface CustomerOrderStatusSnapshot {
  id: string
  order_number: string
  payment_status: 'pending' | 'paid' | 'failed'
  order_status: string
  mpesa_checkout_request_id: string | null
  mpesa_receipt_number: string | null
  mpesa_result_desc: string | null
  payment_expires_at: string | null
  customer_phone: string
}

export interface CheckOrderPaymentResult {
  success: boolean
  order?: CustomerOrderStatusSnapshot
  gatewayMessage?: string
  rateLimited?: boolean
  error?: string
}

function getOrderInitiatedIso(
  paymentExpiresAt: string | null,
  createdAt: string
): string {
  const expiresMs = paymentExpiresAt ? Date.parse(paymentExpiresAt) : NaN
  if (Number.isFinite(expiresMs)) {
    return new Date(expiresMs - 120_000).toISOString()
  }
  return createdAt
}

export async function checkCustomerOrderPaymentStatus(
  orderId: string,
  forceDarajaQuery = false
): Promise<CheckOrderPaymentResult> {
  const supabase = await createServerSupabaseClient()
  const adminSupabase = createServiceRoleSupabaseClient()
  const storeId = getStoreId()

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, payment_status, order_status, mpesa_checkout_request_id, mpesa_receipt_number, mpesa_result_desc, payment_expires_at, created_at, customer_phone'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .single()

  if (error || !order) {
    return { success: false, error: 'Order not found.' }
  }

  const snapshot: CustomerOrderStatusSnapshot = {
    id: order.id,
    order_number: order.order_number,
    payment_status: order.payment_status as 'pending' | 'paid' | 'failed',
    order_status: order.order_status,
    mpesa_checkout_request_id: order.mpesa_checkout_request_id,
    mpesa_receipt_number: order.mpesa_receipt_number,
    mpesa_result_desc: order.mpesa_result_desc,
    payment_expires_at: order.payment_expires_at,
    customer_phone: order.customer_phone,
  }

  // If already paid or cancelled in DB (e.g. via instant webhook), return immediately
  if (order.payment_status === 'paid' || order.order_status === 'cancelled') {
    return {
      success: true,
      order: snapshot,
      gatewayMessage: order.mpesa_result_desc || undefined,
    }
  }

  // If DB already recorded a failed/cancelled prompt (e.g. from webhook 1032) and user didn't force a manual check
  if (order.payment_status === 'failed' && !forceDarajaQuery) {
    if (order.customer_phone) {
      clearRateLimit(`stk_phone_${order.customer_phone}`)
    }
    return {
      success: true,
      order: snapshot,
      gatewayMessage: order.mpesa_result_desc || undefined,
    }
  }

  const checkoutReqId = order.mpesa_checkout_request_id?.trim()
  if (!checkoutReqId || checkoutReqId.startsWith('RETRY-')) {
    return {
      success: true,
      order: snapshot,
      gatewayMessage: order.mpesa_result_desc || undefined,
    }
  }

  if (forceDarajaQuery) {
    const rate = checkRateLimit(`manual-stk-query:${orderId}`, {
      maxRequests: 5,
      windowMs: 60_000,
      minIntervalMs: 6_000,
    })
    if (!rate.allowed) {
      return {
        success: true,
        order: snapshot,
        gatewayMessage: `Please wait ${rate.retryAfterSeconds}s before checking again.`,
        rateLimited: true,
      }
    }
  } else {
    const initiatedIso = getOrderInitiatedIso(
      order.payment_expires_at,
      order.created_at
    )
    if (
      order.payment_status !== 'pending' ||
      !shouldRunScheduledDarajaQuery(order.id, initiatedIso, 12_000, 15_000)
    ) {
      return {
        success: true,
        order: snapshot,
        gatewayMessage: order.mpesa_result_desc || undefined,
      }
    }
  }

  try {
    const queryResult = await queryDarajaStkStatus(checkoutReqId)

    // 1. Payment Succeeded (ResultCode === 0): Confirm order & atomically deduct stock once
    if (queryResult.state === 'succeeded') {
      await adminSupabase.rpc('finalize_order_mpesa_payment', {
        target_order_id: order.id,
        checkout_req_id: checkoutReqId,
        result_code: 0,
        result_desc: queryResult.description || 'Confirmed via Daraja STK Query',
        receipt_num: queryResult.receiptNumber ?? null,
        raw_payload: null,
      })

      const { data: refreshed } = await adminSupabase
        .from('orders')
        .select('mpesa_receipt_number, payment_expires_at')
        .eq('id', order.id)
        .maybeSingle()

      revalidatePath(`/orders/${order.id}`)
      revalidatePath('/orders')
      revalidatePath('/inventory')
      revalidatePath('/shop')

      return {
        success: true,
        order: {
          ...snapshot,
          payment_status: 'paid',
          order_status: 'confirmed',
          mpesa_receipt_number:
            refreshed?.mpesa_receipt_number ||
            queryResult.receiptNumber ||
            order.mpesa_receipt_number,
          mpesa_result_desc: queryResult.description,
          payment_expires_at: refreshed?.payment_expires_at || new Date().toISOString(),
        },
        gatewayMessage: 'M-Pesa payment verified and order confirmed!',
      }
    }

    // 2. Customer Cancelled Prompt on Phone (1032), Timed Out (1037), or Failed (1 / 2001):
    //    Immediately stop timer, release phone rate-limit cooldown, and DO NOT deduct stock
    if (
      queryResult.state === 'cancelled' ||
      queryResult.state === 'failed' ||
      queryResult.state === 'timed_out'
    ) {
      const numericCode =
        queryResult.state === 'cancelled'
          ? 1032
          : Number(queryResult.resultCode) || 1
      const expiredNowIso = new Date().toISOString()

      await adminSupabase.rpc('finalize_order_mpesa_payment', {
        target_order_id: order.id,
        checkout_req_id: checkoutReqId,
        result_code: numericCode,
        result_desc: queryResult.description,
        receipt_num: null,
        raw_payload: null,
      })

      // Ensure payment_expires_at is immediately expired in DB so countdown stops at 0:00
      await adminSupabase
        .from('orders')
        .update({ payment_expires_at: expiredNowIso })
        .eq('id', order.id)

      if (order.customer_phone) {
        clearRateLimit(`stk_phone_${order.customer_phone}`)
      }

      revalidatePath(`/orders/${order.id}`)
      revalidatePath('/orders')

      return {
        success: true,
        order: {
          ...snapshot,
          payment_status: 'failed',
          mpesa_result_desc: queryResult.description,
          payment_expires_at: expiredNowIso,
        },
        gatewayMessage: queryResult.description,
      }
    }

    // 3. Still Pending on Handset (or rate_limited / upstream_error)
    return {
      success: true,
      order: snapshot,
      gatewayMessage: queryResult.description,
    }
  } catch (err) {
    return {
      success: true,
      order: snapshot,
      gatewayMessage:
        err instanceof Error
          ? err.message
          : 'Waiting for Safaricom M-Pesa confirmation...',
    }
  }
}

export async function resendCustomerStkPush(
  orderId: string,
  newPhone?: string
): Promise<{
  success?: boolean
  payment_expires_at?: string
  customer_phone?: string
  checkoutRequestId?: string
  message?: string
  error?: string
}> {
  const supabase = await createServerSupabaseClient()
  const adminSupabase = createServiceRoleSupabaseClient()
  const storeId = getStoreId()

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, total_amount, customer_phone, payment_status, order_status'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .single()

  if (error || !order) {
    return { error: 'Order not found.' }
  }

  if (order.payment_status === 'paid') {
    return { error: 'This order has already been paid.' }
  }

  let normalizedPhone: string
  try {
    normalizedPhone = normalizeKenyanPhone(newPhone || order.customer_phone)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Enter a valid Kenyan M-Pesa phone number.',
    }
  }

  const rateCheck = canProceedRateLimit(`stk_phone_${normalizedPhone}`, {
    maxRequests: 5,
    windowMs: 5 * 60 * 1000,
    minIntervalMs: 15 * 1000,
  })

  if (!rateCheck.allowed) {
    return {
      error: `Please wait ${rateCheck.retryAfterSeconds}s before sending another M-Pesa prompt to +${normalizedPhone}.`,
    }
  }

  try {
    const stkResponse = await initiateDarajaStkPush({
      phone: normalizedPhone,
      amount: Number(order.total_amount),
      orderNumber: order.order_number,
      description: 'LuminousDrip',
    })

    commitRateLimit(`stk_phone_${normalizedPhone}`, 5 * 60 * 1000)
    markStkPushInitiated(order.id)

    const newExpiresAt = new Date(Date.now() + 120 * 1000).toISOString()

    await adminSupabase.rpc('attach_order_stk_request', {
      target_order_id: order.id,
      target_store_id: storeId,
      checkout_req_id: stkResponse.CheckoutRequestID,
      merchant_req_id: stkResponse.MerchantRequestID,
      result_desc: stkResponse.CustomerMessage,
      updated_phone: normalizedPhone,
    })

    revalidatePath(`/orders/${order.id}`)
    revalidatePath('/orders')

    return {
      success: true,
      payment_expires_at: newExpiresAt,
      customer_phone: normalizedPhone,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: `New M-Pesa prompt sent to +${normalizedPhone}. Check your phone to enter your PIN.`,
    }
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'Failed to dispatch M-Pesa STK prompt.'

    await adminSupabase.rpc('attach_order_stk_request', {
      target_order_id: order.id,
      target_store_id: storeId,
      checkout_req_id: null,
      merchant_req_id: null,
      result_desc: `STK Error: ${errMsg}`,
      updated_phone: normalizedPhone,
    })

    return {
      customer_phone: normalizedPhone,
      error: errMsg,
    }
  }
}

export async function cancelCustomerPendingOrder(
  orderId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const adminSupabase = createServiceRoleSupabaseClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select('id, payment_status, customer_phone')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  if (order.payment_status === 'paid') {
    return { error: 'This order is already paid and confirmed.' }
  }

  const { data: cancelledOk, error: rpcError } = await adminSupabase.rpc(
    'customer_cancel_pending_order',
    {
      target_order_id: orderId,
      target_store_id: storeId,
    }
  )

  if (rpcError || !cancelledOk) {
    return {
      error: rpcError?.message || 'Unable to cancel this order.',
    }
  }

  // Ensure payment_expires_at is immediately expired and phone cooldown is cleared
  await adminSupabase
    .from('orders')
    .update({ payment_expires_at: new Date().toISOString() })
    .eq('id', orderId)

  if (order.customer_phone) {
    clearRateLimit(`stk_phone_${order.customer_phone}`)
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')

  return { success: true }
}

export async function submitCustomerMpesaReceiptCode(
  orderId: string,
  receiptCode: string
): Promise<{
  success: boolean
  receipt?: string
  verifiedImmediately?: boolean
  message?: string
  error?: string
}> {
  const cleanCode = receiptCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (cleanCode.length < 10 || cleanCode.length > 12) {
    return {
      success: false,
      error: 'Please enter a valid 10-character M-Pesa transaction code (e.g., SJK8912XYZ).',
    }
  }

  const supabase = await createServerSupabaseClient()
  const adminSupabase = createServiceRoleSupabaseClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select('id, mpesa_checkout_request_id, payment_status')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .single()

  if (!order) {
    return { success: false, error: 'Order not found.' }
  }

  // 1. If an active CheckoutRequestID exists, query Daraja to verify if the STK push succeeded
  if (order.mpesa_checkout_request_id) {
    try {
      const queryResult = await queryDarajaStkStatus(order.mpesa_checkout_request_id)
      if (queryResult.state === 'succeeded') {
        await adminSupabase.rpc('finalize_order_mpesa_payment', {
          target_order_id: order.id,
          checkout_req_id: order.mpesa_checkout_request_id,
          result_code: 0,
          result_desc: `Verified via Daraja STK Query with customer receipt ${cleanCode}`,
          receipt_num: cleanCode,
          raw_payload: null,
        })
        revalidatePath(`/orders/${orderId}`)
        revalidatePath('/orders')
        revalidatePath('/inventory')
        return {
          success: true,
          receipt: cleanCode,
          verifiedImmediately: true,
          message: 'Payment confirmed with Safaricom M-Pesa!',
        }
      }
    } catch {
      // Fall through to safe manual receipt RPC logging
    }
  }

  // 2. Record the receipt code via SECURITY DEFINER RPC (checks duplicates & works under anon RLS)
  const { error: rpcError } = await supabase.rpc('submit_manual_mpesa_receipt', {
    target_order_id: orderId,
    target_store_id: storeId,
    submitted_receipt: cleanCode,
  })

  if (rpcError) {
    return { success: false, error: rpcError.message }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')

  return {
    success: true,
    receipt: cleanCode,
    verifiedImmediately: false,
    message: `Receipt ${cleanCode} submitted! An administrator will verify and confirm your order shortly.`,
  }
}
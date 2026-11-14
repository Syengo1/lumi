'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import {
  initiateDarajaStkPush,
  normalizeKenyanPhone,
  queryDarajaStkStatus,
} from '@/lib/daraja/mpesa'
import { checkRateLimit, markStkPushInitiated } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'

export async function checkCustomerOrderPaymentStatus(
  orderId: string,
  forceDarajaQuery = false
) {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, order_number, payment_status, order_status, mpesa_receipt_number, mpesa_result_desc, mpesa_checkout_request_id, payment_expires_at, customer_phone, total_amount, created_at'
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  // 1. If already paid, failed, or cancelled in DB, return immediately
  if (
    order.payment_status === 'paid' ||
    order.payment_status === 'failed' ||
    order.order_status === 'cancelled'
  ) {
    return { order }
  }

  // 2. Background polls ONLY check Supabase DB (updated by /api/daraja/callback).
  // We only call Safaricom's /stkpushquery endpoint when the user clicks "Verify" (forceDarajaQuery = true).
  if (!forceDarajaQuery) {
    return { order }
  }

  // 3. Rate limit manual Daraja stkpushquery to at most 1 call every 10 seconds per order
  const queryLimit = checkRateLimit(`stk_query_${order.id}`, {
    maxRequests: 6,
    windowMs: 120 * 1000,
    minIntervalMs: 10000,
  })

  if (!queryLimit.allowed) {
    return {
      order,
      gatewayMessage: `Please wait ${queryLimit.retryAfterSeconds}s before querying Safaricom again.`,
    }
  }

  let gatewayMessage: string | undefined

  if (
    order.mpesa_checkout_request_id &&
    !order.mpesa_checkout_request_id.startsWith('RETRY-')
  ) {
    try {
      const queryResult = await queryDarajaStkStatus(order.mpesa_checkout_request_id)
      gatewayMessage = queryResult.description

      if (queryResult.state === 'paid') {
        await supabase.rpc('finalize_order_mpesa_payment', {
          target_order_id: order.id,
          checkout_req_id: order.mpesa_checkout_request_id,
          result_code: 0,
          result_desc: queryResult.description,
          receipt_num: null,
        })
        revalidatePath(`/orders/${orderId}`)
      } else if (queryResult.state === 'failed') {
        await supabase.rpc('finalize_order_mpesa_payment', {
          target_order_id: order.id,
          checkout_req_id: order.mpesa_checkout_request_id,
          result_code: Number(queryResult.resultCode) || 1,
          result_desc: queryResult.description,
          receipt_num: null,
        })
        revalidatePath(`/orders/${orderId}`)
      }
    } catch (err) {
      gatewayMessage =
        err instanceof Error
          ? err.message
          : 'Safaricom Daraja query timed out. Try again in a few seconds.'
    }
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
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, customer_phone, total_amount, payment_status')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  if (order.payment_status === 'paid') {
    return { error: 'This order has already been paid.' }
  }

  let phoneToUse = order.customer_phone
  if (newPhone && newPhone.trim() !== '') {
    try {
      phoneToUse = normalizeKenyanPhone(newPhone)
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Invalid M-Pesa phone number.' }
    }
  }

  const newExpiresAt = new Date(Date.now() + 120 * 1000).toISOString()

  try {
    const stk = await initiateDarajaStkPush({
      phone: phoneToUse,
      amount: Number(order.total_amount),
      orderNumber: order.order_number,
      description: 'OrderRetry',
    })

    // Only lock the rate limiter AFTER Safaricom Daraja accepts the STK push
    checkRateLimit(`stk_phone_${phoneToUse}`, {
      maxRequests: 4,
      windowMs: 5 * 60 * 1000,
      minIntervalMs: 30 * 1000,
    })
    markStkPushInitiated(order.id)

    await supabase.rpc('attach_order_stk_request', {
      target_order_id: order.id,
      target_store_id: storeId,
      checkout_req_id: stk.CheckoutRequestID,
      merchant_req_id: stk.MerchantRequestID,
      result_desc: stk.CustomerMessage,
      updated_phone: phoneToUse,
    })

    revalidatePath(`/orders/${orderId}`)
    return {
      success: true,
      message: `Fresh STK Push sent to +${phoneToUse}. Keep your phone screen unlocked!`,
      payment_expires_at: newExpiresAt,
      customer_phone: phoneToUse,
    }
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : 'Could not reach Safaricom Daraja. Please verify your Daraja API keys.'

    await supabase.rpc('attach_order_stk_request', {
      target_order_id: order.id,
      target_store_id: storeId,
      checkout_req_id: null,
      merchant_req_id: null,
      result_desc: `STK Error: ${errMsg}`,
      updated_phone: phoneToUse,
    })

    revalidatePath(`/orders/${orderId}`)
    return {
      error: errMsg,
      payment_expires_at: newExpiresAt,
      customer_phone: phoneToUse,
    }
  }
}

export async function simulateSandboxOrderPayment(orderId: string) {
  if (process.env.MPESA_ENV === 'production') {
    return { error: 'Sandbox simulation is disabled in production.' }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: order } = await supabase
    .from('orders')
    .select('id, mpesa_checkout_request_id, payment_status')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) {
    return { error: 'Order not found.' }
  }

  const mockReceipt = `SBX${Date.now().toString().slice(-7)}`

  await supabase.rpc('finalize_order_mpesa_payment', {
    target_order_id: order.id,
    checkout_req_id: order.mpesa_checkout_request_id,
    result_code: 0,
    result_desc: 'Simulated Sandbox PIN Confirmation (Dev Mode)',
    receipt_num: mockReceipt,
  })

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  revalidatePath('/inventory')

  return {
    success: true,
    receipt: mockReceipt,
  }
}

export async function cancelCustomerPendingOrder(orderId: string) {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: ok, error } = await supabase.rpc('customer_cancel_pending_order', {
    target_order_id: orderId,
    target_store_id: storeId,
  })

  if (error || !ok) {
    return { error: 'Could not cancel this order (it may already be paid or processed).' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { success: true }
}
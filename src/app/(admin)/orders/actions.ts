'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { queryDarajaStkStatus } from '@/lib/daraja/mpesa'
import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@/lib/orders/types'

async function requireStoreAdmin() {
  const supabase = await createClient()
  const storeId = getStoreId()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (roleData?.role !== 'admin') {
    throw new Error('Unauthorized: Store administrator privileges required.')
  }

  return { supabase, storeId }
}

function revalidateOrderPaths(orderId?: string) {
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  revalidatePath('/inventory')
  if (orderId) {
    revalidatePath(`/orders/${orderId}`)
  }
}

export async function updateOrderStatus(orderId: string, nextStatus: OrderStatus) {
  const { supabase, storeId } = await requireStoreAdmin()

  const updatePayload: Record<string, unknown> = {
    order_status: nextStatus,
  }

  if (nextStatus === 'dispatched') {
    updatePayload.dispatched_at = new Date().toISOString()
  } else if (nextStatus === 'delivered') {
    updatePayload.delivered_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .eq('store_id', storeId)

  if (error) {
    throw new Error(`Failed to update order status: ${error.message}`)
  }

  revalidateOrderPaths(orderId)
}

export async function manualVerifyMpesaReceipt(orderId: string, receiptCode: string) {
  const { supabase, storeId } = await requireStoreAdmin()

  const formattedReceipt = receiptCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!formattedReceipt || formattedReceipt.length < 6) {
    throw new Error('Please enter a valid M-Pesa Receipt Number (e.g., SJK8912XYZ).')
  }

  const { data: existingOrder, error: fetchError } = await supabase
    .from('orders')
    .select('id, mpesa_checkout_request_id')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .single()

  if (fetchError || !existingOrder) {
    throw new Error('Order not found.')
  }

  const { data: finalizedId, error: rpcError } = await supabase.rpc(
    'finalize_order_mpesa_payment',
    {
      target_order_id: existingOrder.id,
      checkout_req_id: existingOrder.mpesa_checkout_request_id,
      result_code: 0,
      result_desc: 'Manually verified by store administrator',
      receipt_num: formattedReceipt,
    }
  )

  if (rpcError || !finalizedId) {
    throw new Error(
      `Failed to record M-Pesa receipt: ${rpcError?.message || 'Order update failed'}`
    )
  }

  revalidateOrderPaths(orderId)
}

export async function syncOrderMpesaStatus(orderId: string) {
  const { supabase, storeId } = await requireStoreAdmin()

  const { data: order } = await supabase
    .from('orders')
    .select('id, mpesa_checkout_request_id, payment_status')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .single()

  if (!order) {
    return { error: 'Order not found.' }
  }

  if (!order.mpesa_checkout_request_id) {
    return { error: 'No Daraja CheckoutRequestID is linked to this order.' }
  }

  try {
    const darajaStatus = await queryDarajaStkStatus(order.mpesa_checkout_request_id)

    if (darajaStatus.state === 'succeeded') {
      const { error: rpcError } = await supabase.rpc('finalize_order_mpesa_payment', {
        target_order_id: order.id,
        checkout_req_id: order.mpesa_checkout_request_id,
        result_code: 0,
        result_desc: darajaStatus.description,
        receipt_num: null,
      })

      if (rpcError) {
        return { error: `Payment confirmed, but DB update failed: ${rpcError.message}` }
      }

      revalidateOrderPaths(orderId)
      return { success: true, message: 'M-Pesa payment confirmed via Daraja!' }
    }

    if (
      darajaStatus.state === 'failed' ||
      darajaStatus.state === 'cancelled' ||
      darajaStatus.state === 'timed_out'
    ) {
      await supabase.rpc('finalize_order_mpesa_payment', {
        target_order_id: order.id,
        checkout_req_id: order.mpesa_checkout_request_id,
        result_code: Number(darajaStatus.resultCode) || 1,
        result_desc: darajaStatus.description,
        receipt_num: null,
      })

      revalidateOrderPaths(orderId)
      return { error: darajaStatus.description }
    }

    // For 'pending', 'rate_limited', or 'upstream_error', log the latest status description without failing the order
    await supabase
      .from('orders')
      .update({
        mpesa_result_desc: darajaStatus.description,
      })
      .eq('id', orderId)
      .eq('store_id', storeId)

    revalidateOrderPaths(orderId)
    return { error: darajaStatus.description }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unable to reach Daraja query endpoint.',
    }
  }
}
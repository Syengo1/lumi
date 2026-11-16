import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { clearRateLimit } from '@/lib/rate-limit'

interface CallbackMetadataItem {
  Name: string
  Value?: string | number
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.MPESA_WEBHOOK_SECRET?.trim()
    if (expectedSecret) {
      const url = new URL(request.url)
      const providedSecret = url.searchParams.get('secret')
      if (providedSecret !== expectedSecret) {
        console.warn('[Daraja Webhook] Rejected unauthorized callback request')
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
    }

    const payload = await request.json()
    const stkCallback = payload?.Body?.stkCallback

    if (!stkCallback || !stkCallback.CheckoutRequestID) {
      console.warn('[Daraja Webhook] Ignored malformed payload missing CheckoutRequestID')
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const checkoutRequestId = String(stkCallback.CheckoutRequestID).trim()
    const merchantRequestId = stkCallback.MerchantRequestID
      ? String(stkCallback.MerchantRequestID).trim()
      : null
    const resultCode = Number(stkCallback.ResultCode ?? -1)
    const rawDesc = String(stkCallback.ResultDesc || 'Processed by Safaricom Daraja').trim()
    const resultDesc =
      resultCode === 1032 && !rawDesc.includes('1032')
        ? `Code 1032: ${rawDesc}`
        : rawDesc

    let mpesaReceiptNumber: string | null = null
    let callbackAmount: number | null = null

    const metadataItems: CallbackMetadataItem[] =
      stkCallback.CallbackMetadata?.Item || []

    for (const item of metadataItems) {
      if (item.Name === 'MpesaReceiptNumber' && item.Value) {
        mpesaReceiptNumber = String(item.Value).trim().toUpperCase()
      } else if (item.Name === 'Amount' && item.Value !== undefined) {
        callbackAmount = Number(item.Value)
      }
    }

    const supabase = createServiceRoleSupabaseClient()

    const { data: matchedOrder } = await supabase
      .from('orders')
      .select(
        'id, order_number, total_amount, mpesa_merchant_request_id, payment_status, customer_phone'
      )
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .maybeSingle()

    if (matchedOrder) {
      if (
        matchedOrder.mpesa_merchant_request_id &&
        merchantRequestId &&
        matchedOrder.mpesa_merchant_request_id !== merchantRequestId
      ) {
        console.error(
          `[Daraja Webhook] MerchantRequestID mismatch for order ${matchedOrder.order_number}`
        )
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }

      if (
        resultCode === 0 &&
        callbackAmount !== null &&
        process.env.MPESA_ENV === 'production' &&
        callbackAmount + 1 < Number(matchedOrder.total_amount)
      ) {
        console.error(
          `[Daraja Webhook] Amount mismatch on order ${matchedOrder.order_number}: expected ${matchedOrder.total_amount}, got ${callbackAmount}`
        )
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
    }

    const { data: finalizedOrderId, error: rpcError } = await supabase.rpc(
      'finalize_order_mpesa_payment',
      {
        target_order_id: matchedOrder?.id ?? null,
        checkout_req_id: checkoutRequestId,
        result_code: resultCode,
        result_desc: resultDesc,
        receipt_num: mpesaReceiptNumber,
        raw_payload: payload,
      }
    )

    // Immediately zero out payment_expires_at when cancelled/failed so UI timer stops instantaneously
    if (resultCode !== 0 && (matchedOrder?.id || finalizedOrderId)) {
      await supabase
        .from('orders')
        .update({ payment_expires_at: new Date().toISOString() })
        .eq('id', matchedOrder?.id || finalizedOrderId)

      if (matchedOrder?.customer_phone) {
        clearRateLimit(`stk_phone_${matchedOrder.customer_phone}`)
      }
    }

    if (rpcError) {
      console.error('[Daraja Webhook] RPC finalize_order_mpesa_payment failed:', rpcError)
    } else {
      console.info(
        `[Daraja Webhook] Reconciled CheckoutRequestID=${checkoutRequestId} (ResultCode=${resultCode}, OrderID=${finalizedOrderId})`
      )
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('[Daraja Webhook Exception]:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Handled' })
  }
}
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStoreId } from '@/lib/supabase/config'

export async function POST(request: Request) {
  try {
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
    const resultCode = Number(stkCallback.ResultCode)
    const resultDesc = String(stkCallback.ResultDesc || 'Processed')

    let receiptNumber: string | null = null
    let callbackAmount: number | null = null

    if (resultCode === 0) {
      const items: Array<{ Name: string; Value?: string | number }> =
        stkCallback.CallbackMetadata?.Item || []
      const receiptItem = items.find((i) => i.Name === 'MpesaReceiptNumber')
      const amountItem = items.find((i) => i.Name === 'Amount')

      receiptNumber = receiptItem?.Value ? String(receiptItem.Value).trim() : null
      callbackAmount = amountItem?.Value !== undefined ? Number(amountItem.Value) : null

      if (
        process.env.MPESA_ENV === 'production' &&
        (!receiptNumber || receiptNumber.startsWith('SBX'))
      ) {
        console.error('[Daraja Webhook Security] Rejected callback without valid MpesaReceiptNumber')
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Rejected' })
      }
    }

    const storeId = getStoreId()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            'x-store-id': storeId,
          },
        },
      }
    )

    // Correlate CheckoutRequestID (and MerchantRequestID if present) against orders
    const { data: matchedOrder } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, mpesa_merchant_request_id, payment_status')
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .maybeSingle()

    if (!matchedOrder) {
      console.warn(
        `[Daraja Webhook] No order matched CheckoutRequestID: ${checkoutRequestId}`
      )
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    if (
      merchantRequestId &&
      matchedOrder.mpesa_merchant_request_id &&
      matchedOrder.mpesa_merchant_request_id !== merchantRequestId
    ) {
      console.error(
        `[Daraja Webhook Mismatch] MerchantRequestID mismatch for ${checkoutRequestId}`
      )
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Rejected' })
    }

    if (
      process.env.MPESA_ENV === 'production' &&
      resultCode === 0 &&
      callbackAmount !== null &&
      Math.round(callbackAmount) < Math.round(Number(matchedOrder.total_amount))
    ) {
      console.error(
        `[Daraja Webhook Amount Mismatch] Expected KES ${matchedOrder.total_amount}, got KES ${callbackAmount}`
      )
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Rejected' })
    }

    const { data: finalizedOrderId, error: rpcError } = await supabase.rpc(
      'finalize_order_mpesa_payment',
      {
        target_order_id: matchedOrder.id,
        checkout_req_id: checkoutRequestId,
        result_code: resultCode,
        result_desc: resultDesc,
        receipt_num: receiptNumber,
        raw_payload: payload,
      }
    )

    if (rpcError) {
      console.error('[Daraja Webhook RPC Error]:', rpcError.message)
    } else {
      console.info(
        `[Daraja Webhook Processed] Order #${matchedOrder.order_number} (${finalizedOrderId}) | ResultCode: ${resultCode} | Receipt: ${receiptNumber || 'N/A'}`
      )
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('[Daraja Webhook Exception]:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Handled' })
  }
}
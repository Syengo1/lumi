import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const stkCallback = payload?.Body?.stkCallback

    if (!stkCallback) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const checkoutRequestId: string = stkCallback.CheckoutRequestID
    const resultCode: number = Number(stkCallback.ResultCode)
    const resultDesc: string = stkCallback.ResultDesc || 'Processed'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    let receiptNumber: string | null = null
    if (resultCode === 0) {
      const items: Array<{ Name: string; Value?: string | number }> =
        stkCallback.CallbackMetadata?.Item || []
      const receiptItem = items.find((i) => i.Name === 'MpesaReceiptNumber')
      receiptNumber = receiptItem?.Value ? String(receiptItem.Value) : 'MPESA-PAID'
    }

    await supabase.rpc('finalize_order_mpesa_payment', {
      target_order_id: null,
      checkout_req_id: checkoutRequestId,
      result_code: resultCode,
      result_desc: resultDesc,
      receipt_num: receiptNumber,
    })

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Handled' })
  }
}
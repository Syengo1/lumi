'use client'

import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react'

interface PaymentStatusHeaderProps {
  orderNumber: string
  phone: string
  receipt: string | null
  totalAmount: number
  isPaid: boolean
  isCancelled: boolean
  isDispatchFailed: boolean
  isExpired: boolean
  isFailed: boolean
}

export function PaymentStatusHeader({
  orderNumber,
  phone,
  receipt,
  totalAmount,
  isPaid,
  isCancelled,
  isDispatchFailed,
  isExpired,
  isFailed,
}: PaymentStatusHeaderProps) {
  return (
    <div className="text-center space-y-2">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm ${
          isPaid
            ? 'bg-primary text-primary-foreground'
            : isCancelled
            ? 'bg-destructive/15 text-destructive'
            : isExpired || isFailed || isDispatchFailed
            ? 'bg-secondary text-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {isPaid ? (
          <CheckCircle2 size={30} />
        ) : isCancelled ? (
          <XCircle size={30} />
        ) : isExpired || isFailed || isDispatchFailed ? (
          <AlertTriangle size={30} className="text-primary" />
        ) : (
          <Clock size={30} className="animate-pulse" />
        )}
      </div>

      <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
        Order #{orderNumber}
      </span>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
        {isPaid
          ? 'Payment Confirmed!'
          : isCancelled
          ? 'Order Cancelled'
          : isDispatchFailed
          ? 'STK Prompt Needs to Be Resent'
          : isExpired
          ? 'M-Pesa Prompt Window Expired'
          : isFailed
          ? 'M-Pesa Prompt Timed Out on Handset'
          : 'Check Your Phone for the M-Pesa Prompt'}
      </h1>

      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {isPaid
          ? `Verified M-Pesa Receipt: ${receipt || 'Confirmed'}. Your order is now being prepared for dispatch.`
          : isCancelled
          ? 'This order was cancelled. No charges were made.'
          : isDispatchFailed
          ? `The initial STK Push to +${phone} did not dispatch. Click "Resend M-Pesa Prompt" below or use the *334# PayBill option.`
          : isExpired || isFailed
          ? `Safaricom could not reach the SIM Toolkit on +${phone}. Dial *334# once on your phone and exit to wake up the line, then click Resend.`
          : `We sent an M-Pesa STK Push for KES ${Number(totalAmount).toLocaleString()} to +${phone}. Keep your phone screen unlocked and enter your M-Pesa PIN.`}
      </p>
    </div>
  )
}
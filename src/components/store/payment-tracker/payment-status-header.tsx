'use client'

import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react'

interface PaymentStatusHeaderProps {
  orderNumber: string
  phone: string
  receipt: string | null
  resultDesc?: string | null
  totalAmount: number
  isPaid: boolean
  isCancelled: boolean
  isPromptCancelled?: boolean
  isDispatchFailed: boolean
  isExpired: boolean
  isFailed: boolean
}

export function PaymentStatusHeader({
  orderNumber,
  phone,
  receipt,
  resultDesc,
  totalAmount,
  isPaid,
  isCancelled,
  isPromptCancelled = false,
  isDispatchFailed,
  isExpired,
  isFailed,
}: PaymentStatusHeaderProps) {
  const lowerDesc = (resultDesc || '').toLowerCase()
  const isInsufficientBalance =
    isFailed && (lowerDesc.includes('insufficient') || lowerDesc.includes('code 1 '))
  const isWrongPin =
    isFailed && (lowerDesc.includes('2001') || lowerDesc.includes('pin'))

  const getHeadline = () => {
    if (isPaid) return 'Payment Confirmed!'
    if (isCancelled) return 'Order Cancelled'
    if (isPromptCancelled) return 'M-Pesa Payment Prompt Cancelled'
    if (isInsufficientBalance) return 'Insufficient M-Pesa Balance'
    if (isWrongPin) return 'Incorrect M-Pesa PIN Entered'
    if (isDispatchFailed) return 'STK Prompt Needs to Be Resent'
    if (isExpired) return 'M-Pesa Prompt Window Expired'
    if (isFailed) return 'M-Pesa Prompt Timed Out on Handset'
    return 'Check Your Phone for the M-Pesa Prompt'
  }

  const getSubtext = () => {
    if (isPaid) {
      return `Verified M-Pesa Receipt: ${receipt || 'Confirmed'}. Your order is confirmed and being prepared for dispatch.`
    }
    if (isCancelled) {
      return 'This order has been cancelled. No M-Pesa charges were made and no stock was deducted.'
    }
    if (isPromptCancelled) {
      return `You cancelled the M-Pesa payment prompt on +${phone}. The countdown was stopped immediately and no items were deducted from stock. You can resend the prompt below or cancel the order.`
    }
    if (isInsufficientBalance) {
      return `Your M-Pesa balance on +${phone} is lower than KES ${Number(totalAmount).toLocaleString()}. Top up your M-Pesa wallet or switch to a different M-Pesa number below.`
    }
    if (isWrongPin) {
      return `An incorrect M-Pesa PIN was entered on +${phone}. Click "Resend M-Pesa Prompt" below to try again.`
    }
    if (isDispatchFailed) {
      return `The initial STK Push to +${phone} did not dispatch. Click "Resend M-Pesa Prompt" below or use the *334# PayBill option.`
    }
    if (isExpired || isFailed) {
      return `Safaricom could not reach the SIM Toolkit on +${phone}. Ensure your phone screen is unlocked and click "Resend M-Pesa Prompt" below.`
    }
    return `We sent an M-Pesa STK Push for KES ${Number(totalAmount).toLocaleString()} to +${phone}. Keep your phone screen unlocked and enter your M-Pesa PIN.`
  }

  return (
    <div className="text-center space-y-2">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm ${
          isPaid
            ? 'bg-primary text-primary-foreground'
            : isCancelled || isPromptCancelled
            ? 'bg-destructive/15 text-destructive'
            : isExpired || isFailed || isDispatchFailed
            ? 'bg-secondary text-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {isPaid ? (
          <CheckCircle2 size={30} />
        ) : isCancelled || isPromptCancelled ? (
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
        {getHeadline()}
      </h1>

      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {getSubtext()}
      </p>
    </div>
  )
}
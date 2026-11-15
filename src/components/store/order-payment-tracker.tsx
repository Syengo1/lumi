'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from './cart-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  checkCustomerOrderPaymentStatus,
  resendCustomerStkPush,
  cancelCustomerPendingOrder,
  submitCustomerMpesaReceiptCode,
} from '@/app/(storefront)/orders/[id]/actions'
import { RotateCcw, ShoppingBag, ShieldCheck } from 'lucide-react'
import { PaymentStatusHeader } from './payment-tracker/payment-status-header'
import { StkPromptControls } from './payment-tracker/stk-prompt-controls'
import { ManualPaybillFallback } from './payment-tracker/manual-paybill-fallback'
import {
  WINDOW_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  type OrderPaymentTrackerProps,
  type TrackerFeedback,
} from './payment-tracker/types'

export function OrderPaymentTracker({
  orderId,
  orderNumber,
  initialPaymentStatus,
  initialOrderStatus,
  initialPhone,
  initialCheckoutRequestId = null,
  initialReceipt,
  initialResultDesc,
  initialExpiresAt,
  totalAmount,
  items,
}: OrderPaymentTrackerProps) {
  const router = useRouter()
  const { addItem } = useCart()

  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus)
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus)
  const [phone, setPhone] = useState(initialPhone)
  const [editingPhone, setEditingPhone] = useState(false)
  const [checkoutReqId, setCheckoutReqId] = useState<string | null>(initialCheckoutRequestId)
  const [receipt, setReceipt] = useState(initialReceipt)
  const [resultDesc, setResultDesc] = useState(initialResultDesc)

  const hasInitialDispatchError =
    !initialCheckoutRequestId || Boolean(initialResultDesc?.startsWith('STK Error:'))

  const [expiresAtIso, setExpiresAtIso] = useState(initialExpiresAt)
  const [secondsLeft, setSecondsLeft] = useState<number>(WINDOW_SECONDS)
  const [resendCooldown, setResendCooldown] = useState<number>(() =>
    hasInitialDispatchError ? 0 : 20
  )

  const [feedback, setFeedback] = useState<TrackerFeedback | null>(() =>
    hasInitialDispatchError && initialResultDesc
      ? { type: 'error', text: initialResultDesc }
      : null
  )
  const [isPending, startTransition] = useTransition()
  const isPollingRef = useRef(false)

  const isPaid = paymentStatus === 'paid'
  const isFailed = paymentStatus === 'failed'
  const isCancelled = orderStatus === 'cancelled'
  const isDispatchFailed =
    !isPaid &&
    !isCancelled &&
    (!checkoutReqId || Boolean(resultDesc?.startsWith('STK Error:')))
  const isExpired = !isPaid && !isCancelled && secondsLeft <= 0

  // 1. Live 1-second Countdown Timer
  useEffect(() => {
    if (isPaid || isCancelled) return

    const parsedTarget = Date.parse(expiresAtIso)
    const targetMs = Number.isFinite(parsedTarget)
      ? parsedTarget
      : Date.now() + WINDOW_SECONDS * 1000

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.min(WINDOW_SECONDS, Math.ceil((targetMs - Date.now()) / 1000))
      )
      setSecondsLeft(remaining)
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAtIso, isPaid, isCancelled])

  // 2. Instant Supabase Realtime Listener
  useEffect(() => {
    if (isPaid || isCancelled) return
    const supabase = createClient()

    const channel = supabase
      .channel(`order-payment-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as {
            payment_status?: 'pending' | 'paid' | 'failed'
            order_status?: string
            mpesa_checkout_request_id?: string | null
            mpesa_receipt_number?: string | null
            mpesa_result_desc?: string | null
          }
          if (updated.payment_status) setPaymentStatus(updated.payment_status)
          if (updated.order_status) setOrderStatus(updated.order_status)
          if (updated.mpesa_checkout_request_id !== undefined) {
            setCheckoutReqId(updated.mpesa_checkout_request_id)
          }
          if (updated.mpesa_receipt_number) setReceipt(updated.mpesa_receipt_number)
          if (updated.mpesa_result_desc) setResultDesc(updated.mpesa_result_desc)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, isPaid, isCancelled])

  // 3. Background Poll every 10s (Checks Supabase DB & runs single fallback Daraja query at +90s)
  useEffect(() => {
    if (isPaid || isFailed || isCancelled || isDispatchFailed) return

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout>

    const pollOnce = async () => {
      if (cancelled || isPollingRef.current) return
      isPollingRef.current = true
      try {
        const res = await checkCustomerOrderPaymentStatus(orderId, false)
        if (!cancelled && res.order) {
          setPaymentStatus(res.order.payment_status as 'pending' | 'paid' | 'failed')
          setOrderStatus(res.order.order_status)
          if (res.order.mpesa_checkout_request_id) {
            setCheckoutReqId(res.order.mpesa_checkout_request_id)
          }
          if (res.order.mpesa_receipt_number) setReceipt(res.order.mpesa_receipt_number)
          if (res.order.mpesa_result_desc) setResultDesc(res.order.mpesa_result_desc)

          if (
            res.order.payment_status === 'paid' ||
            res.order.payment_status === 'failed' ||
            res.order.order_status === 'cancelled'
          ) {
            return
          }
        }
      } finally {
        isPollingRef.current = false
      }

      if (!cancelled) {
        timerId = setTimeout(pollOnce, 10000)
      }
    }

    timerId = setTimeout(pollOnce, 10000)

    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [orderId, isPaid, isFailed, isCancelled, isDispatchFailed])

  const handleManualCheck = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await checkCustomerOrderPaymentStatus(orderId, true)
      if (res.order) {
        setPaymentStatus(res.order.payment_status as 'pending' | 'paid' | 'failed')
        setOrderStatus(res.order.order_status)
        setReceipt(res.order.mpesa_receipt_number)
        setResultDesc(res.order.mpesa_result_desc)
        if (res.order.payment_status === 'paid') {
          setFeedback({ type: 'info', text: 'M-Pesa payment confirmed!' })
        } else if (res.order.payment_status === 'failed') {
          setFeedback({
            type: 'error',
            text:
              res.gatewayMessage ||
              res.order.mpesa_result_desc ||
              'M-Pesa prompt was declined or timed out.',
          })
        } else {
          setFeedback({
            type: 'info',
            text:
              res.gatewayMessage ||
              'Still awaiting PIN entry on your handset. Keep your phone screen unlocked.',
          })
        }
      }
    })
  }

  const handleResendStk = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await resendCustomerStkPush(orderId, phone)
      if (res.payment_expires_at) {
        setExpiresAtIso(res.payment_expires_at)
        setSecondsLeft(WINDOW_SECONDS)
        setPaymentStatus('pending')
        setOrderStatus('pending')
      }
      if (res.customer_phone) {
        setPhone(res.customer_phone)
        setEditingPhone(false)
      }
      if (res.error) {
        setResendCooldown(0)
        setFeedback({ type: 'error', text: res.error })
      } else if (res.message) {
        if (res.checkoutRequestId) setCheckoutReqId(res.checkoutRequestId)
        setResendCooldown(RESEND_COOLDOWN_SECONDS)
        setResultDesc('Success. Request accepted for processing')
        setFeedback({ type: 'info', text: res.message })
      }
    })
  }

  const handleManualReceiptSubmit = (code: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await submitCustomerMpesaReceiptCode(orderId, code)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
      } else if (res.success) {
        setPaymentStatus('paid')
        setOrderStatus('confirmed')
        setReceipt(res.receipt || code.toUpperCase())
        setResultDesc('Verified via M-Pesa Receipt Code')
      }
    })
  }

  const handleCancelAndRestoreBag = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await cancelCustomerPendingOrder(orderId)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
        return
      }

      items.forEach((item) => {
        addItem(
          {
            productId: item.product_id || item.id,
            title: item.title,
            selectedSize: item.selected_size,
            primaryColor: item.primary_color || 'Black',
            colorHex: '#18181b',
            unitPrice: Number(item.unit_price),
            regularPrice: Number(item.unit_price),
            quantity: item.quantity,
            maxStock: Math.max(10, item.quantity),
            imageUrl: item.image_url,
          },
          false
        )
      })

      setOrderStatus('cancelled')
      setPaymentStatus('failed')
      router.push('/checkout')
    })
  }

  return (
    <div className="p-8 bg-primary/10 border-b border-border/50 space-y-6">
      <PaymentStatusHeader
        orderNumber={orderNumber}
        phone={phone}
        receipt={receipt}
        totalAmount={totalAmount}
        isPaid={isPaid}
        isCancelled={isCancelled}
        isDispatchFailed={isDispatchFailed}
        isExpired={isExpired}
        isFailed={isFailed}
      />

      {!isPaid && !isCancelled && (
        <div className="max-w-md mx-auto p-5 rounded-2xl bg-card shadow-xs space-y-4">
          <StkPromptControls
            secondsLeft={secondsLeft}
            isFailed={isFailed}
            isDispatchFailed={isDispatchFailed}
            feedback={feedback}
            phone={phone}
            editingPhone={editingPhone}
            resendCooldown={resendCooldown}
            isPending={isPending}
            onPhoneChange={setPhone}
            onToggleEditPhone={setEditingPhone}
            onManualCheck={handleManualCheck}
            onResendStk={handleResendStk}
          />

          <ManualPaybillFallback
            orderNumber={orderNumber}
            totalAmount={totalAmount}
            isPending={isPending}
            onSubmitReceipt={handleManualReceiptSubmit}
          />

          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <button
              type="button"
              disabled={isPending}
              onClick={handleCancelAndRestoreBag}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              Cancel Order &amp; Edit Bag
            </button>

            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck size={12} className="text-primary" /> Live Realtime Sync
            </span>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            onClick={() => router.push('/shop')}
            className="rounded-xl font-bold gap-2"
          >
            <ShoppingBag size={16} /> Return to Shop
          </Button>
        </div>
      )}

      {resultDesc && !isPaid && (
        <p className="text-center text-xs text-muted-foreground max-w-lg mx-auto">
          Daraja Status: <span className="font-semibold text-foreground">{resultDesc}</span>
        </p>
      )}
    </div>
  )
}
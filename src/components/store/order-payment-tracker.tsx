'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
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
import { RotateCcw, ShoppingBag, XCircle } from 'lucide-react'
import { PaymentStatusHeader } from './payment-tracker/payment-status-header'
import { StkPromptControls } from './payment-tracker/stk-prompt-controls'
import { ManualPaybillFallback } from './payment-tracker/manual-paybill-fallback'
import {
  WINDOW_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  type OrderPaymentTrackerProps,
  type TrackerFeedback,
} from './payment-tracker/types'

function isHandsetCancellationDesc(desc: string | null | undefined): boolean {
  if (!desc) return false
  const lower = desc.toLowerCase()
  return (
    lower.includes('1032') ||
    lower.includes('1031') ||
    lower.includes('cancelled by customer') ||
    lower.includes('cancelled by user') ||
    lower.includes('cancelled on the phone') ||
    lower.includes('request cancelled')
  )
}

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
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    initialPaymentStatus === 'pending' &&
    initialOrderStatus !== 'cancelled' &&
    !hasInitialDispatchError
      ? WINDOW_SECONDS
      : 0
  )
  const [resendCooldown, setResendCooldown] = useState<number>(() =>
    hasInitialDispatchError || initialPaymentStatus === 'failed' ? 0 : 15
  )
  const [feedback, setFeedback] = useState<TrackerFeedback | null>(() => {
    if (hasInitialDispatchError && initialResultDesc) {
      return { type: 'error', text: initialResultDesc }
    }
    if (initialPaymentStatus === 'failed' && initialResultDesc) {
      return { type: 'error', text: initialResultDesc }
    }
    return null
  })
  const [isPending, startTransition] = useTransition()
  const isPollingRef = useRef(false)
  const zeroCheckTriggeredRef = useRef(false)

  const isPaid = paymentStatus === 'paid'
  const isFailed = paymentStatus === 'failed'
  const isCancelled = orderStatus === 'cancelled'
  const isPromptCancelled = isFailed && isHandsetCancellationDesc(resultDesc)
  const isDispatchFailed =
    !isPaid &&
    !isCancelled &&
    (!checkoutReqId || Boolean(resultDesc?.startsWith('STK Error:')))

  // Derive active countdown seconds during render so terminal states zero out instantaneously
  // without calling setState synchronously inside useEffect
  const activeSecondsLeft =
    isPaid || isCancelled || isFailed || isDispatchFailed ? 0 : secondsLeft
  const isExpired = !isPaid && !isCancelled && !isFailed && activeSecondsLeft <= 0

  const applyOrderUpdate = useCallback(
    (
      updated: {
        payment_status?: 'pending' | 'paid' | 'failed'
        order_status?: string
        mpesa_checkout_request_id?: string | null
        mpesa_receipt_number?: string | null
        mpesa_result_desc?: string | null
        payment_expires_at?: string | null
        customer_phone?: string
      },
      gatewayMsg?: string
    ) => {
      if (updated.payment_status) {
        setPaymentStatus(updated.payment_status)
        if (updated.payment_status === 'failed' || updated.payment_status === 'paid') {
          setSecondsLeft(0)
          if (updated.payment_status === 'failed') {
            setResendCooldown(0)
          }
        }
      }
      if (updated.order_status) {
        setOrderStatus(updated.order_status)
        if (updated.order_status === 'cancelled') {
          setSecondsLeft(0)
          setResendCooldown(0)
        }
      }
      if (updated.mpesa_checkout_request_id !== undefined) {
        setCheckoutReqId(updated.mpesa_checkout_request_id)
      }
      if (updated.mpesa_receipt_number !== undefined) {
        setReceipt(updated.mpesa_receipt_number)
      }
      if (updated.mpesa_result_desc !== undefined) {
        setResultDesc(updated.mpesa_result_desc)
      }
      if (updated.payment_expires_at) {
        setExpiresAtIso(updated.payment_expires_at)
      }
      if (updated.customer_phone) {
        setPhone(updated.customer_phone)
      }

      if (updated.payment_status === 'paid') {
        setFeedback({
          type: 'info',
          text: gatewayMsg || 'M-Pesa payment confirmed! Your order is now confirmed.',
        })
      } else if (updated.payment_status === 'failed') {
        const desc = gatewayMsg || updated.mpesa_result_desc
        if (desc) {
          setFeedback({ type: 'error', text: desc })
        }
      }
    },
    []
  )

  // 1. Live 1-second Countdown Timer (Only updates state inside the interval callback)
  useEffect(() => {
    if (isPaid || isCancelled || isFailed || isDispatchFailed) return

    const parsedTarget = Date.parse(expiresAtIso)
    const targetMs = Number.isFinite(parsedTarget)
      ? parsedTarget
      : Date.now() + WINDOW_SECONDS * 1000

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.min(WINDOW_SECONDS, Math.ceil((targetMs - Date.now()) / 1000))
      )
      setSecondsLeft(remaining)
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAtIso, isPaid, isCancelled, isFailed, isDispatchFailed])

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
            payment_expires_at?: string | null
            customer_phone?: string
          }
          applyOrderUpdate(updated)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, isPaid, isCancelled, applyOrderUpdate])

  // 3. Fast Background Poll every 4s (Detects webhook updates & handset cancellations rapidly)
  useEffect(() => {
    if (isPaid || isFailed || isCancelled || isDispatchFailed) return

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout>

    const pollOnce = async (forceQuery = false) => {
      if (cancelled || isPollingRef.current) return
      isPollingRef.current = true
      try {
        const res = await checkCustomerOrderPaymentStatus(orderId, forceQuery)
        if (!cancelled && res.order) {
          applyOrderUpdate(res.order, res.gatewayMessage)
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
        timerId = setTimeout(() => void pollOnce(false), 4000)
      }
    }

    timerId = setTimeout(() => void pollOnce(false), 4000)
    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [orderId, isPaid, isFailed, isCancelled, isDispatchFailed, applyOrderUpdate])

  // 4. Final Daraja Reconciliation Query if Countdown Reaches 0
  useEffect(() => {
    if (
      activeSecondsLeft === 0 &&
      paymentStatus === 'pending' &&
      orderStatus !== 'cancelled' &&
      !isDispatchFailed &&
      !zeroCheckTriggeredRef.current
    ) {
      zeroCheckTriggeredRef.current = true
      const timerId = setTimeout(async () => {
        const res = await checkCustomerOrderPaymentStatus(orderId, true)
        if (res.order) {
          applyOrderUpdate(res.order, res.gatewayMessage)
        }
      }, 0)
      return () => clearTimeout(timerId)
    }
  }, [
    activeSecondsLeft,
    paymentStatus,
    orderStatus,
    isDispatchFailed,
    orderId,
    applyOrderUpdate,
  ])

  const handleManualCheck = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await checkCustomerOrderPaymentStatus(orderId, true)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
        return
      }
      if (res.order) {
        applyOrderUpdate(res.order, res.gatewayMessage)
        if (res.order.payment_status === 'pending') {
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
      if (res.customer_phone) {
        setPhone(res.customer_phone)
        setEditingPhone(false)
      }
      if (res.error) {
        setResendCooldown(0)
        setFeedback({ type: 'error', text: res.error })
        return
      }
      if (res.payment_expires_at) {
        zeroCheckTriggeredRef.current = false
        setExpiresAtIso(res.payment_expires_at)
        setSecondsLeft(WINDOW_SECONDS)
        setPaymentStatus('pending')
        setOrderStatus('pending')
      }
      if (res.checkoutRequestId) {
        setCheckoutReqId(res.checkoutRequestId)
      }
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setResultDesc('Success. Request accepted for processing')
      if (res.message) {
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
        setReceipt(res.receipt || code.toUpperCase())
        if (res.verifiedImmediately) {
          setPaymentStatus('paid')
          setOrderStatus('confirmed')
          setSecondsLeft(0)
          setResultDesc('Verified via M-Pesa Receipt Code')
          setFeedback({
            type: 'info',
            text: res.message || 'M-Pesa payment confirmed!',
          })
        } else {
          setResultDesc(`Receipt ${res.receipt || code.toUpperCase()} submitted for verification`)
          setFeedback({
            type: 'info',
            text:
              res.message ||
              'Receipt submitted! Your order will be confirmed once verified.',
          })
        }
      }
    })
  }

  const handleCancelOrderOnly = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await cancelCustomerPendingOrder(orderId)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
        return
      }
      setSecondsLeft(0)
      setOrderStatus('cancelled')
      setPaymentStatus('failed')
      setResultDesc('Order cancelled by customer. No stock was deducted.')
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
      setSecondsLeft(0)
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
        resultDesc={resultDesc}
        totalAmount={totalAmount}
        isPaid={isPaid}
        isCancelled={isCancelled}
        isPromptCancelled={isPromptCancelled}
        isDispatchFailed={isDispatchFailed}
        isExpired={isExpired}
        isFailed={isFailed}
      />

      {!isPaid && !isCancelled && (
        <div className="max-w-md mx-auto p-5 rounded-2xl bg-card shadow-xs space-y-4">
          <StkPromptControls
            secondsLeft={activeSecondsLeft}
            isFailed={isFailed}
            isPromptCancelled={isPromptCancelled}
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
            onCancelOrder={handleCancelOrderOnly}
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
            <button
              type="button"
              disabled={isPending}
              onClick={handleCancelOrderOnly}
              className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline cursor-pointer"
            >
              <XCircle size={13} />
              Cancel Order
            </button>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="flex flex-wrap justify-center gap-3 pt-2">
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
          M-Pesa Status: <span className="font-semibold text-foreground">{resultDesc}</span>
        </p>
      )}
    </div>
  )
}
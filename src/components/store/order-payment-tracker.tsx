'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from './cart-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  checkCustomerOrderPaymentStatus,
  resendCustomerStkPush,
  cancelCustomerPendingOrder,
  simulateSandboxOrderPayment,
} from '@/app/(storefront)/orders/[id]/actions'
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Smartphone,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ShoppingBag,
  ShieldCheck,
  Zap,
} from 'lucide-react'

interface OrderItemSummary {
  id: string
  product_id: string | null
  title: string
  selected_size: string
  primary_color: string | null
  quantity: number
  unit_price: number
  image_url: string | null
}

interface OrderPaymentTrackerProps {
  orderId: string
  orderNumber: string
  initialPaymentStatus: 'pending' | 'paid' | 'failed'
  initialOrderStatus: string
  initialPhone: string
  initialReceipt: string | null
  initialResultDesc: string | null
  initialExpiresAt: string
  totalAmount: number
  items: OrderItemSummary[]
}

const WINDOW_SECONDS = 120
const RESEND_COOLDOWN_SECONDS = 30

export function OrderPaymentTracker({
  orderId,
  orderNumber,
  initialPaymentStatus,
  initialOrderStatus,
  initialPhone,
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
  const [receipt, setReceipt] = useState(initialReceipt)
  const [resultDesc, setResultDesc] = useState(initialResultDesc)

  // Deterministic initial state so Server SSR and Client Hydration always match
  const [expiresAtIso, setExpiresAtIso] = useState(initialExpiresAt)
  const [secondsLeft, setSecondsLeft] = useState<number>(WINDOW_SECONDS)
  const [resendCooldown, setResendCooldown] = useState<number>(() =>
    initialResultDesc?.startsWith('STK Error:') ? 0 : 15
  )

  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(
    null
  )
  const [isPending, startTransition] = useTransition()
  const isPollingRef = useRef(false)

  const isPaid = paymentStatus === 'paid'
  const isFailed = paymentStatus === 'failed'
  const isCancelled = orderStatus === 'cancelled'
  const isExpired = !isPaid && !isCancelled && secondsLeft <= 0

  // 1. Live 1-second Countdown Timer (Runs only on client after mount, avoiding SSR mismatch)
  useEffect(() => {
    if (isPaid || isCancelled) return

    const parsedTarget = Date.parse(expiresAtIso)
    const targetMs = Number.isFinite(parsedTarget)
      ? parsedTarget
      : Date.now() + WINDOW_SECONDS * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.min(WINDOW_SECONDS, Math.ceil((targetMs - Date.now()) / 1000)))
      setSecondsLeft(remaining)
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAtIso, isPaid, isCancelled])

  // 2. Instant Supabase Realtime Listener when /api/daraja/callback updates public.orders
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
            mpesa_receipt_number?: string | null
            mpesa_result_desc?: string | null
          }
          if (updated.payment_status) setPaymentStatus(updated.payment_status)
          if (updated.order_status) setOrderStatus(updated.order_status)
          if (updated.mpesa_receipt_number) setReceipt(updated.mpesa_receipt_number)
          if (updated.mpesa_result_desc) setResultDesc(updated.mpesa_result_desc)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, isPaid, isCancelled])

  // 3. Lightweight DB-only background poll every 10s
  useEffect(() => {
    if (isPaid || isFailed || isCancelled) return

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
  }, [orderId, isPaid, isFailed, isCancelled])

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  const progressPct = Math.min(100, Math.max(0, Math.round((secondsLeft / WINDOW_SECONDS) * 100)))

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
        setResendCooldown(RESEND_COOLDOWN_SECONDS)
        setResultDesc('Success. Request accepted for processing')
        setFeedback({ type: 'info', text: res.message })
      }
    })
  }

  const handleSimulateSandboxSuccess = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await simulateSandboxOrderPayment(orderId)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
      } else if (res.success) {
        setPaymentStatus('paid')
        setOrderStatus('confirmed')
        setReceipt(res.receipt || 'SBX-PAID')
        setResultDesc('Simulated Sandbox PIN Confirmation')
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
      <div className="text-center space-y-2">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm ${
            isPaid
              ? 'bg-primary text-primary-foreground'
              : isCancelled
              ? 'bg-destructive/15 text-destructive'
              : isExpired || isFailed
              ? 'bg-secondary text-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {isPaid ? (
            <CheckCircle2 size={30} />
          ) : isCancelled ? (
            <XCircle size={30} />
          ) : isExpired || isFailed ? (
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
            : isExpired || isFailed
            ? `Safaricom could not reach the SIM Toolkit on +${phone}. Dial *334# once on your phone and exit to wake up the line, then click Resend.`
            : `We sent an M-Pesa STK Push to +${phone} (KES 1 Sandbox Test for Order KES ${Number(totalAmount).toLocaleString()}). Keep your phone screen unlocked!`}
        </p>
      </div>

      {!isPaid && !isCancelled && (
        <div className="max-w-md mx-auto p-5 rounded-2xl bg-card shadow-xs space-y-4">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock size={14} className="text-primary" />
              {secondsLeft > 0 && !isFailed
                ? 'STK Prompt Window Remaining'
                : 'Ready to Resend STK Push'}
            </span>
            <span
              suppressHydrationWarning
              className={`font-mono text-base font-extrabold ${
                secondsLeft <= 20 || isFailed ? 'text-destructive' : 'text-primary'
              }`}
            >
              {formatTimer(secondsLeft)}
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 rounded-full ${
                secondsLeft <= 20 || isFailed ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${isFailed ? 0 : progressPct}%` }}
            />
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                feedback.type === 'error'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {editingPhone ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712 345 678 or 0114 513 647"
                className="h-9 bg-secondary/80 border-none rounded-xl text-xs font-mono"
              />
              <Button
                type="button"
                size="sm"
                disabled={isPending || resendCooldown > 0}
                onClick={handleResendStk}
                className="rounded-xl text-xs font-bold shrink-0"
              >
                {resendCooldown > 0 ? `Wait ${resendCooldown}s` : 'Send to New #'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>
                Phone: <strong className="text-foreground font-mono">+{phone}</strong>
              </span>
              <button
                type="button"
                onClick={() => setEditingPhone(true)}
                className="text-primary font-bold hover:underline cursor-pointer"
              >
                Change M-Pesa Number
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            <Button
              type="button"
              onClick={handleManualCheck}
              disabled={isPending}
              className="rounded-xl font-bold text-xs gap-1.5 h-10"
            >
              <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
              I Entered My PIN (Verify)
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleResendStk}
              disabled={isPending || resendCooldown > 0}
              className="rounded-xl font-bold text-xs gap-1.5 h-10"
            >
              <Smartphone size={14} className="text-primary" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend M-Pesa Prompt'}
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleSimulateSandboxSuccess}
            disabled={isPending}
            className="w-full rounded-xl font-bold text-xs gap-1.5 h-9 border-dashed border-primary/40 text-primary hover:bg-primary/10"
          >
            <Zap size={14} />
            Simulate Sandbox PIN Success (Dev Mode)
          </Button>

          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <button
              type="button"
              disabled={isPending}
              onClick={handleCancelAndRestoreBag}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              Cancel Order & Edit Bag
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
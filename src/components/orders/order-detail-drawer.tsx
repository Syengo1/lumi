'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  calculateOrderProfit,
  type OrderRecord,
  type OrderStatus,
  type StoreOriginInfo,
} from '@/lib/orders/types'
import {
  updateOrderStatus,
  manualVerifyMpesaReceipt,
  syncOrderMpesaStatus,
} from '@/app/(admin)/orders/actions'
import {
  X,
  Smartphone,
  MapPin,
  Navigation,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Phone,
  Mail,
  Package,
  Truck,
  Store,
  ShieldCheck,
} from 'lucide-react'

interface OrderDetailDrawerProps {
  order: OrderRecord | null
  storeOrigin: StoreOriginInfo
  productCostMap: Record<string, number>
  onClose: () => void
}

const ORDER_STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'pending', label: 'Pending Review' },
  { value: 'confirmed', label: 'Confirmed & Packing' },
  { value: 'dispatched', label: 'Dispatched with Rider' },
  { value: 'delivered', label: 'Delivered to Customer' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function OrderDetailDrawer({
  order,
  storeOrigin,
  productCostMap,
  onClose,
}: OrderDetailDrawerProps) {
  const [manualReceipt, setManualReceipt] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!order) return null

  const profitStats = calculateOrderProfit(order, productCostMap)

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value)
    setCopiedText(label)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const handleStatusChange = (nextStatus: OrderStatus) => {
    setFeedback(null)
    startTransition(async () => {
      try {
        await updateOrderStatus(order.id, nextStatus)
        setFeedback({ type: 'success', text: `Order status updated to ${nextStatus}.` })
      } catch (err) {
        setFeedback({
          type: 'error',
          text: err instanceof Error ? err.message : 'Status update failed.',
        })
      }
    })
  }

  const handleDarajaSync = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await syncOrderMpesaStatus(order.id)
      if (res.error) {
        setFeedback({ type: 'error', text: res.error })
      } else if (res.message) {
        setFeedback({ type: 'success', text: res.message })
      }
    })
  }

  const handleManualReceiptSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        await manualVerifyMpesaReceipt(order.id, manualReceipt)
        setManualReceipt('')
        setFeedback({
          type: 'success',
          text: 'M-Pesa receipt recorded and order marked as Paid!',
        })
      } catch (err) {
        setFeedback({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to verify receipt.',
        })
      }
    })
  }

  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeOrigin.origin_lat},${storeOrigin.origin_lng}&destination=${order.delivery_lat},${order.delivery_lng}&travelmode=driving`

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-foreground/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-card text-card-foreground shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-xl tracking-tight">
                  {order.order_number}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                    order.payment_status === 'paid'
                      ? 'bg-primary/15 text-primary'
                      : order.payment_status === 'failed'
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  M-Pesa {order.payment_status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Placed on {new Date(order.created_at).toLocaleString('en-KE')}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {feedback && (
              <div
                className={`p-3.5 rounded-xl text-xs font-bold ${
                  feedback.type === 'success'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-destructive/15 text-destructive'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {/* 1. Fulfillment Status Workflow */}
            <div className="p-5 rounded-2xl bg-secondary/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Fulfillment Pipeline Stage
                </span>
                <span className="text-xs font-extrabold uppercase text-primary">
                  {order.order_status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {ORDER_STATUS_OPTIONS.map((stage) => {
                  const isCurrent = order.order_status === stage.value
                  return (
                    <button
                      key={stage.value}
                      type="button"
                      disabled={isPending || isCurrent}
                      onClick={() => handleStatusChange(stage.value)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-card hover:bg-secondary text-foreground'
                      }`}
                    >
                      {stage.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. M-Pesa Daraja Payment Telemetry */}
            <div className="p-5 rounded-2xl bg-secondary/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">M-Pesa Daraja Telemetry</h3>
                    <p className="text-xs text-muted-foreground">
                      STK Push reference & transaction verification
                    </p>
                  </div>
                </div>

                {order.payment_status !== 'paid' && order.mpesa_checkout_request_id && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={handleDarajaSync}
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} />
                    Query Daraja Live
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-card flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground font-medium">M-Pesa Receipt Number</p>
                    <p className="font-mono font-extrabold text-sm text-primary mt-0.5">
                      {order.mpesa_receipt_number || 'AWAITING PIN / UNPAID'}
                    </p>
                  </div>
                  {order.mpesa_receipt_number && (
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(order.mpesa_receipt_number!, 'receipt')
                      }
                      className="p-2 rounded-lg hover:bg-secondary text-muted-foreground cursor-pointer"
                      title="Copy M-Pesa Receipt"
                    >
                      {copiedText === 'receipt' ? (
                        <Check size={14} className="text-primary" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-card">
                  <p className="text-muted-foreground font-medium">Payer Phone Number</p>
                  <p className="font-mono font-bold text-sm mt-0.5">
                    +{order.customer_phone}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-card sm:col-span-2">
                  <p className="text-muted-foreground font-medium">Daraja Gateway Log</p>
                  <p className="font-medium text-foreground mt-0.5">
                    {order.mpesa_result_desc || 'No callback description logged yet.'}
                  </p>
                  {order.mpesa_checkout_request_id && (
                    <p className="text-[11px] font-mono text-muted-foreground mt-1">
                      CheckoutRequestID: {order.mpesa_checkout_request_id}
                    </p>
                  )}
                </div>
              </div>

              {/* Manual Receipt Override if Customer Paid or Callback Delayed */}
              {order.payment_status !== 'paid' && (
                <form
                  onSubmit={handleManualReceiptSubmit}
                  className="pt-2 border-t border-border/50 flex flex-col sm:flex-row gap-2"
                >
                  <Input
                    value={manualReceipt}
                    onChange={(e) => setManualReceipt(e.target.value)}
                    placeholder="Enter M-Pesa Code (e.g. SJK8912XYZ) to verify..."
                    className="h-9 bg-card border-none rounded-xl text-xs font-mono uppercase"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isPending || !manualReceipt.trim()}
                    className="rounded-xl text-xs font-bold shrink-0 gap-1.5"
                  >
                    <ShieldCheck size={14} /> Confirm Receipt
                  </Button>
                </form>
              )}
            </div>

            {/* 3. Customer & Geospatial Delivery Intelligence */}
            <div className="p-5 rounded-2xl bg-secondary/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    {order.delivery_method === 'pickup' ? (
                      <Store size={18} />
                    ) : (
                      <MapPin size={18} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {order.delivery_method === 'pickup'
                        ? 'Store Pickup Details'
                        : 'Delivery Destination & GPS Pin'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Haversine Distance: <strong>{order.distance_km} km</strong> from{' '}
                      {storeOrigin.origin_address}
                    </p>
                  </div>
                </div>

                {order.delivery_method === 'delivery' && (
                  <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl text-xs font-bold gap-1.5 shadow-sm shadow-primary/20"
                    >
                      <Navigation size={13} /> Rider Route
                    </Button>
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-card space-y-1">
                  <p className="text-muted-foreground font-medium">Customer</p>
                  <p className="font-bold text-sm">{order.customer_name}</p>
                  <div className="flex items-center gap-3 pt-1">
                    <a
                      href={`tel:+${order.customer_phone}`}
                      className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
                    >
                      <Phone size={12} /> +{order.customer_phone}
                    </a>
                    {order.customer_email && (
                      <a
                        href={`mailto:${order.customer_email}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Mail size={12} /> Email
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-card space-y-1">
                  <p className="text-muted-foreground font-medium">Address & Apartment</p>
                  <p className="font-bold text-sm">{order.delivery_address}</p>
                  {order.delivery_apartment && (
                    <p className="text-muted-foreground">{order.delivery_apartment}</p>
                  )}
                </div>
              </div>

              {order.delivery_notes && (
                <div className="p-3.5 rounded-xl bg-card text-xs">
                  <span className="font-bold text-foreground">Rider Note: </span>
                  <span className="text-muted-foreground">{order.delivery_notes}</span>
                </div>
              )}

              {/* Embedded Google Map Pin Verification */}
              {order.delivery_method === 'delivery' && (
                <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-secondary border border-border/50">
                  <iframe
                    title={`Delivery Pin for ${order.order_number}`}
                    width="100%"
                    height="100%"
                    loading="lazy"
                    src={`https://maps.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}&z=15&output=embed`}
                    className="border-0 w-full h-full"
                  />
                </div>
              )}
            </div>

            {/* 4. Ordered Line Items & Profit Breakdown */}
            <div className="p-5 rounded-2xl bg-secondary/40 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Package size={16} className="text-primary" />
                  Ordered Items ({order.items.length})
                </h3>
                <span className="text-xs font-bold text-primary">
                  Net Profit: KES {profitStats.netProfit.toLocaleString()} ({profitStats.marginPercent}%)
                </span>
              </div>

              <div className="space-y-2.5">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-card flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-secondary shrink-0">
                        {item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                            N/A
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="px-2 py-0.5 rounded-md bg-secondary font-semibold text-foreground">
                            Size: {item.selected_size}
                          </span>
                          {item.primary_color && <span>Color: {item.primary_color}</span>}
                          {item.sku && <span>• {item.sku}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-sm">
                        KES {Number(item.line_total).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × KES {Number(item.unit_price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial Summary Box */}
              <div className="p-4 rounded-xl bg-card space-y-2 text-xs pt-3">
                <div className="flex justify-between text-muted-foreground">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-foreground">
                    KES {Number(order.subtotal).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Product Buy Cost (COGS)</span>
                  <span className="font-semibold text-foreground">
                    -KES {profitStats.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee ({order.distance_km} km)</span>
                  <span className="font-semibold text-foreground">
                    KES {Number(order.delivery_fee).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-border/60">
                  <span>Total Billed (M-Pesa)</span>
                  <span className="text-primary">
                    KES {Number(order.total_amount).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
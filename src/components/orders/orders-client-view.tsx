'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  calculateOrderProfit,
  computeOrdersPortfolioAnalytics,
  type OrderRecord,
  type StoreOriginInfo,
} from '@/lib/orders/types'
import { OrdersAnalyticsStrip } from './orders-analytics-strip'
import { OrderDetailDrawer } from './order-detail-drawer'
import {
  Search,
  Eye,
  MapPin,
  Smartphone,
  CheckCircle2,
  Clock,
  XCircle,
  Navigation,
} from 'lucide-react'

interface OrdersClientViewProps {
  orders: OrderRecord[]
  storeOrigin: StoreOriginInfo
  productCostMap: Record<string, number>
}

export function OrdersClientView({
  orders,
  storeOrigin,
  productCostMap,
}: OrdersClientViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [deliveryFilter, setDeliveryFilter] = useState<string>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const analytics = useMemo(
    () => computeOrdersPortfolioAnalytics(orders, productCostMap),
    [orders, productCostMap]
  )

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.order_status !== statusFilter) return false
      if (paymentFilter !== 'all' && order.payment_status !== paymentFilter) return false
      if (deliveryFilter !== 'all' && order.delivery_method !== deliveryFilter) return false

      if (search.trim() !== '') {
        const q = search.toLowerCase().trim()
        const matchOrderNum = order.order_number.toLowerCase().includes(q)
        const matchCustomer = order.customer_name.toLowerCase().includes(q)
        const matchPhone = order.customer_phone.toLowerCase().includes(q)
        const matchMpesa = (order.mpesa_receipt_number || '').toLowerCase().includes(q)
        const matchAddress = order.delivery_address.toLowerCase().includes(q)
        const matchItem = order.items.some((i) => i.title.toLowerCase().includes(q))

        if (
          !matchOrderNum &&
          !matchCustomer &&
          !matchPhone &&
          !matchMpesa &&
          !matchAddress &&
          !matchItem
        ) {
          return false
        }
      }

      return true
    })
  }, [orders, statusFilter, paymentFilter, deliveryFilter, search])

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  )

  return (
    <div className="space-y-6 pt-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Orders, M-Pesa & Dispatch Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Track Safaricom Daraja STK references, customer delivery pins, and net order profitability.
          </p>
        </div>
      </div>

      {/* Analytics KPIs & Interactive Status Pipeline */}
      <OrdersAnalyticsStrip
        analytics={analytics}
        activeStatusFilter={statusFilter}
        onSelectStatusFilter={setStatusFilter}
      />

      {/* Search & Multi-Facet Filter Bar */}
      <div className="p-4 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2 relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by M-Pesa receipt (e.g. SJK...), order #, customer, phone, or estate..."
            className="h-10 pl-10 border-none bg-secondary/70 rounded-xl text-sm"
          />
        </div>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="h-10 px-3.5 bg-secondary/70 rounded-xl text-xs font-bold outline-none"
        >
          <option value="all">All M-Pesa Statuses</option>
          <option value="paid">Paid (Verified Receipt)</option>
          <option value="pending">Pending STK Prompt</option>
          <option value="failed">Failed / Cancelled Prompt</option>
        </select>

        <select
          value={deliveryFilter}
          onChange={(e) => setDeliveryFilter(e.target.value)}
          className="h-10 px-3.5 bg-secondary/70 rounded-xl text-xs font-bold outline-none"
        >
          <option value="all">All Fulfillment Modes</option>
          <option value="delivery">Doorstep GPS Delivery</option>
          <option value="pickup">Store Pickup</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="pl-4">Order & Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Ordered Items</TableHead>
              <TableHead>Delivery Location & Pin</TableHead>
              <TableHead>M-Pesa Reference</TableHead>
              <TableHead className="text-right">Total & Profit</TableHead>
              <TableHead>Fulfillment</TableHead>
              <TableHead className="text-right pr-4">Inspect</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredOrders.map((order) => {
              const profit = calculateOrderProfit(order, productCostMap)
              const totalUnits = order.items.reduce((sum, i) => sum + i.quantity, 0)
              const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeOrigin.origin_lat},${storeOrigin.origin_lng}&destination=${order.delivery_lat},${order.delivery_lng}&travelmode=driving`

              return (
                <TableRow
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="border-border/50 cursor-pointer hover:bg-secondary/40 transition-colors"
                >
                  {/* Order # & Timestamp */}
                  <TableCell className="pl-4 py-3.5">
                    <p className="font-extrabold text-sm text-foreground">
                      {order.order_number}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString('en-KE', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </TableCell>

                  {/* Customer Name & Phone */}
                  <TableCell>
                    <p className="font-bold text-sm">{order.customer_name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      +{order.customer_phone}
                    </p>
                  </TableCell>

                  {/* Items & Sizes Summary */}
                  <TableCell>
                    <p className="font-semibold text-xs">
                      {totalUnits} {totalUnits === 1 ? 'unit' : 'units'} ({order.items.length}{' '}
                      {order.items.length === 1 ? 'item' : 'items'})
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[180px]">
                      {order.items
                        .map((i) => `${i.title} (${i.selected_size}×${i.quantity})`)
                        .join(', ')}
                    </p>
                  </TableCell>

                  {/* Delivery Destination & Haversine Distance */}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-primary shrink-0" />
                      <span className="font-semibold text-xs truncate max-w-[160px]">
                        {order.delivery_address}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      <span>
                        {order.delivery_method === 'pickup'
                          ? 'Pickup'
                          : `${order.distance_km} km • KES ${Number(order.delivery_fee).toLocaleString()}`}
                      </span>
                      {order.delivery_method === 'delivery' && (
                        <a
                          href={routeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-primary font-bold hover:underline"
                        >
                          <Navigation size={10} /> Map
                        </a>
                      )}
                    </div>
                  </TableCell>

                  {/* M-Pesa Receipt Code & Payment Status */}
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5">
                      {order.payment_status === 'paid' ? (
                        <CheckCircle2 size={14} className="text-primary shrink-0" />
                      ) : order.payment_status === 'failed' ? (
                        <XCircle size={14} className="text-destructive shrink-0" />
                      ) : (
                        <Clock size={14} className="text-muted-foreground shrink-0" />
                      )}
                      <span className="font-mono font-extrabold text-xs">
                        {order.mpesa_receipt_number || 'PENDING PIN'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5 flex items-center gap-1">
                      <Smartphone size={10} /> {order.payment_status}
                    </p>
                  </TableCell>

                  {/* Total Billed & Net Profit */}
                  <TableCell className="text-right">
                    <p className="font-extrabold text-sm">
                      KES {Number(order.total_amount).toLocaleString()}
                    </p>
                    <p className="text-[11px] font-semibold text-primary">
                      Profit: +KES {profit.netProfit.toLocaleString()} ({profit.marginPercent}%)
                    </p>
                  </TableCell>

                  {/* Fulfillment Status Badge */}
                  <TableCell>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        order.order_status === 'delivered'
                          ? 'bg-primary/15 text-primary'
                          : order.order_status === 'dispatched'
                          ? 'bg-foreground text-background'
                          : order.order_status === 'confirmed'
                          ? 'bg-primary/10 text-primary'
                          : order.order_status === 'cancelled'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {order.order_status}
                    </span>
                  </TableCell>

                  {/* Inspect Action */}
                  <TableCell className="text-right pr-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedOrderId(order.id)
                      }}
                      className="rounded-xl gap-1.5 text-xs font-bold"
                    >
                      <Eye size={15} /> Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}

            {filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-14 text-muted-foreground">
                  No orders match your current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detailed Slide-Over Inspector */}
      <OrderDetailDrawer
        order={activeOrder}
        storeOrigin={storeOrigin}
        productCostMap={productCostMap}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  )
}
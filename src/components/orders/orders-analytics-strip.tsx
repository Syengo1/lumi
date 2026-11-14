'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { OrderStatus } from '@/lib/orders/types'
import {
  Wallet,
  TrendingUp,
  Smartphone,
  Truck,
  Clock,
  CheckCircle2,
  PackageCheck,
  XCircle,
} from 'lucide-react'

interface OrdersAnalyticsStripProps {
  analytics: {
    totalOrders: number
    paidOrdersCount: number
    pendingPaymentCount: number
    realizedGrossRevenue: number
    realizedDeliveryFees: number
    realizedNetProfit: number
    pendingRevenuePipeline: number
    averageOrderValue: number
    avgDeliveryDistanceKm: number
    conversionRate: number
    statusCounts: Record<OrderStatus, number>
  }
  activeStatusFilter: string
  onSelectStatusFilter: (status: string) => void
}

export function OrdersAnalyticsStrip({
  analytics,
  activeStatusFilter,
  onSelectStatusFilter,
}: OrdersAnalyticsStripProps) {
  const kpiCards = [
    {
      label: 'Realized M-Pesa Revenue',
      value: `KES ${analytics.realizedGrossRevenue.toLocaleString()}`,
      subtext: `${analytics.paidOrdersCount} paid orders • AOV: KES ${analytics.averageOrderValue.toLocaleString()}`,
      icon: Wallet,
      highlight: false,
    },
    {
      label: 'Net Realized Profit',
      value: `KES ${analytics.realizedNetProfit.toLocaleString()}`,
      subtext: `After product buy cost (COGS)`,
      icon: TrendingUp,
      highlight: true,
    },
    {
      label: 'M-Pesa STK Pipeline',
      value: `KES ${analytics.pendingRevenuePipeline.toLocaleString()}`,
      subtext: `${analytics.pendingPaymentCount} awaiting PIN • ${analytics.conversionRate}% conversion`,
      icon: Smartphone,
      highlight: false,
    },
    {
      label: 'Delivery & Haversine',
      value: `KES ${analytics.realizedDeliveryFees.toLocaleString()}`,
      subtext: `Avg distance: ${analytics.avgDeliveryDistanceKm} km from hub`,
      icon: Truck,
      highlight: false,
    },
  ]

  const pipelineStages: Array<{
    key: string
    label: string
    count: number
    icon: typeof Clock
  }> = [
    { key: 'all', label: 'All Orders', count: analytics.totalOrders, icon: Wallet },
    { key: 'pending', label: 'Pending', count: analytics.statusCounts.pending, icon: Clock },
    { key: 'confirmed', label: 'Confirmed', count: analytics.statusCounts.confirmed, icon: CheckCircle2 },
    { key: 'dispatched', label: 'Dispatched', count: analytics.statusCounts.dispatched, icon: Truck },
    { key: 'delivered', label: 'Delivered', count: analytics.statusCounts.delivered, icon: PackageCheck },
    { key: 'cancelled', label: 'Cancelled', count: analytics.statusCounts.cancelled, icon: XCircle },
  ]

  return (
    <div className="space-y-4">
      {/* Top 4 Financial & Logistics KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card
              key={kpi.label}
              className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </span>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                </div>
                <p
                  className={`text-2xl font-extrabold tracking-tight ${
                    kpi.highlight ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {kpi.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.subtext}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Interactive Fulfillment Status Pipeline Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {pipelineStages.map((stage) => {
          const Icon = stage.icon
          const active = activeStatusFilter === stage.key
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onSelectStatusFilter(stage.key)}
              className={`p-3.5 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                active
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-card hover:bg-secondary/80 text-foreground shadow-[0_4px_20px_rgb(0,0,0,0.03)]'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold opacity-85">
                  <Icon size={13} />
                  <span>{stage.label}</span>
                </div>
                <p className="text-lg font-extrabold">{stage.count}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
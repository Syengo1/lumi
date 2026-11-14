'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { calculateProductFinancials } from '@/lib/inventory/constants'
import { TrendingUp, Percent, Wallet, Tag } from 'lucide-react'

interface PricingProfitCardProps {
  buyPrice: number
  sellPrice: number
  offerPrice: number | null
  totalStock: number
  onBuyPriceChange: (val: number) => void
  onSellPriceChange: (val: number) => void
  onOfferPriceChange: (val: number | null) => void
}

export function PricingProfitCard({
  buyPrice,
  sellPrice,
  offerPrice,
  totalStock,
  onBuyPriceChange,
  onSellPriceChange,
  onOfferPriceChange,
}: PricingProfitCardProps) {
  const stats = calculateProductFinancials(buyPrice, sellPrice, offerPrice, totalStock)

  const inputStyle =
    'h-11 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl pl-14 font-semibold'

  return (
    <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl overflow-hidden">
      <CardHeader className="px-8 pt-8 pb-4">
        <CardTitle className="text-lg">Pricing, Offer & Profit Engine (KES)</CardTitle>
        <CardDescription>
          Enter buying cost, selling price, and optional promotional offer price to track margins automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Buy Price (Cost) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold ml-1">Buy / Cost Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-xs">
                KES
              </span>
              <Input
                type="number"
                name="buy_price"
                step="1"
                min="0"
                required
                value={buyPrice || ''}
                onChange={(e) => onBuyPriceChange(parseFloat(e.target.value) || 0)}
                placeholder="2200"
                className={inputStyle}
              />
            </div>
            <p className="text-[11px] text-muted-foreground ml-1">Unit wholesale/production cost</p>
          </div>

          {/* Regular Selling Price */}
          <div className="space-y-2">
            <label className="text-sm font-semibold ml-1">Regular Sell Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-xs">
                KES
              </span>
              <Input
                type="number"
                name="price"
                step="1"
                min="0"
                required
                value={sellPrice || ''}
                onChange={(e) => onSellPriceChange(parseFloat(e.target.value) || 0)}
                placeholder="4500"
                className={inputStyle}
              />
            </div>
            <p className="text-[11px] text-muted-foreground ml-1">Standard storefront price</p>
          </div>

          {/* Offer / Promo Price */}
          <div className="space-y-2">
            <label className="text-sm font-semibold ml-1 flex items-center justify-between">
              <span>Offer Price (Optional)</span>
              {stats.discountPercent > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                  -{stats.discountPercent}% OFF
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-xs">
                KES
              </span>
              <Input
                type="number"
                name="offer_price"
                step="1"
                min="0"
                value={offerPrice ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim()
                  onOfferPriceChange(val === '' ? null : parseFloat(val) || 0)
                }}
                placeholder="3800"
                className={inputStyle}
              />
            </div>
            <p className="text-[11px] text-muted-foreground ml-1">Leave blank if not on sale</p>
          </div>
        </div>

        {/* Live Profit & Revenue Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-secondary/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Tag size={14} className="text-primary" />
              <span>Effective Price</span>
            </div>
            <p className="text-base font-extrabold">
              KES {stats.effectivePrice.toLocaleString()}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-secondary/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <TrendingUp size={14} className="text-primary" />
              <span>Profit / Unit</span>
            </div>
            <p
              className={`text-base font-extrabold ${
                stats.unitProfit >= 0 ? 'text-foreground' : 'text-destructive'
              }`}
            >
              KES {stats.unitProfit.toLocaleString()}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-secondary/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Percent size={14} className="text-primary" />
              <span>Profit Margin</span>
            </div>
            <p
              className={`text-base font-extrabold ${
                stats.profitMargin >= 25
                  ? 'text-primary'
                  : stats.profitMargin < 0
                  ? 'text-destructive'
                  : 'text-foreground'
              }`}
            >
              {stats.profitMargin}%
            </p>
          </div>

          <div className="p-4 rounded-xl bg-primary/10 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
              <Wallet size={14} />
              <span>Est. Revenue ({totalStock} pcs)</span>
            </div>
            <p className="text-base font-extrabold text-primary">
              KES {stats.projectedRevenue.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Net Profit: KES {stats.projectedProfit.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
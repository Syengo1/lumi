'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCart } from './cart-context'
import type { ProductItem } from '@/lib/inventory/constants'
import { ShoppingBag } from 'lucide-react'

export function ProductCard({ product }: { product: ProductItem }) {
  const { addItem } = useCart()

  const regularPrice = Number(product.price) || 0
  const offerPrice =
    product.offer_price && Number(product.offer_price) > 0 && Number(product.offer_price) < regularPrice
      ? Number(product.offer_price)
      : null
  const effectivePrice = offerPrice ?? regularPrice
  const discountPct =
    offerPrice !== null && regularPrice > 0
      ? Math.round(((regularPrice - offerPrice) / regularPrice) * 100)
      : 0

  const variants = Array.isArray(product.variants) ? product.variants : []
  const availableVariants = variants.filter((v) => Number(v.stock) > 0)
  const inStock = (product.stock_count ?? 0) > 0

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!inStock) return

    const defaultVariant = availableVariants[0]
    addItem({
      productId: product.id,
      title: product.title,
      selectedSize: defaultVariant ? defaultVariant.size : 'Standard',
      primaryColor: product.primary_color || 'Black',
      colorHex: product.color_hex || '#18181b',
      unitPrice: effectivePrice,
      regularPrice,
      quantity: 1,
      maxStock: defaultVariant ? defaultVariant.stock : product.stock_count,
      imageUrl: product.image_urls?.[0] || null,
    })
  }

  return (
    <Link
      href={`/products/${product.id}`}
      className="group rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1"
    >
      {/* Image Container */}
      <div className="relative aspect-[4/5] w-full bg-secondary overflow-hidden">
        {product.image_urls?.[0] ? (
          <Image
            src={product.image_urls[0]}
            alt={product.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            No Image Available
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {!inStock ? (
            <span className="px-3 py-1 rounded-full bg-foreground/85 text-background text-xs font-bold">
              Sold Out
            </span>
          ) : discountPct > 0 ? (
            <span className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-extrabold shadow-xs">
              -{discountPct}% OFF
            </span>
          ) : null}
        </div>

        {/* Color Pill */}
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-card/90 backdrop-blur-xs text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs">
          <span
            className="w-2.5 h-2.5 rounded-full border border-border"
            style={{ background: product.color_hex || '#18181b' }}
          />
          <span>{product.primary_color || 'Black'}</span>
        </div>

        {/* Quick Add Button */}
        {inStock && (
          <button
            type="button"
            onClick={handleQuickAdd}
            className="absolute bottom-3 right-3 px-3.5 py-2 rounded-xl bg-card/95 hover:bg-primary hover:text-primary-foreground text-foreground font-bold text-xs shadow-md flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          >
            <ShoppingBag size={14} />
            Quick Add
          </button>
        )}
      </div>

      {/* Product Info */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <h3 className="font-bold text-base group-hover:text-primary transition-colors line-clamp-1">
            {product.title}
          </h3>

          {/* Size Chips Preview */}
          {availableVariants.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {availableVariants.slice(0, 5).map((v) => (
                <span
                  key={v.size}
                  className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-semibold text-muted-foreground"
                >
                  {v.size}
                </span>
              ))}
              {availableVariants.length > 5 && (
                <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-semibold text-muted-foreground">
                  +{availableVariants.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="pt-2.5 flex items-center justify-between border-t border-border/50">
          <div>
            <span className="font-extrabold text-base text-primary">
              KES {effectivePrice.toLocaleString()}
            </span>
            {offerPrice !== null && (
              <span className="text-xs line-through text-muted-foreground ml-2">
                KES {regularPrice.toLocaleString()}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground">
            Select Size →
          </span>
        </div>
      </div>
    </Link>
  )
}
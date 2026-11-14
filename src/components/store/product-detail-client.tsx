'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCart } from './cart-context'
import { Button } from '@/components/ui/button'
import type { ProductItem } from '@/lib/inventory/constants'
import {
  ShoppingBag,
  Zap,
  CheckCircle2,
  Ruler,
  PackageCheck,
  Plus,
  Minus,
} from 'lucide-react'

export function ProductDetailClient({ product }: { product: ProductItem }) {
  const router = useRouter()
  const { addItem } = useCart()

  const images =
    Array.isArray(product.image_urls) && product.image_urls.length > 0
      ? product.image_urls
      : []
  const [activeImageIdx, setActiveImageIdx] = useState(0)

  const variants = Array.isArray(product.variants) ? product.variants : []
  const firstAvailableVariant = variants.find((v) => Number(v.stock) > 0) || variants[0]

  const [selectedSize, setSelectedSize] = useState<string>(
    firstAvailableVariant?.size || 'Standard'
  )
  const [quantity, setQuantity] = useState(1)

  const currentVariant = variants.find((v) => v.size === selectedSize)
  const maxStockForSelection = currentVariant
    ? Number(currentVariant.stock)
    : Number(product.stock_count ?? 0)
  const isAvailable = maxStockForSelection > 0

  const regularPrice = Number(product.price) || 0
  const offerPrice =
    product.offer_price &&
    Number(product.offer_price) > 0 &&
    Number(product.offer_price) < regularPrice
      ? Number(product.offer_price)
      : null
  const effectivePrice = offerPrice ?? regularPrice

  const handleAddToCart = (goToCheckout = false) => {
    if (!isAvailable) return

    addItem(
      {
        productId: product.id,
        title: product.title,
        selectedSize,
        primaryColor: product.primary_color || 'Black',
        colorHex: product.color_hex || '#18181b',
        unitPrice: effectivePrice,
        regularPrice,
        quantity,
        maxStock: maxStockForSelection,
        imageUrl: images[0] || null,
      },
      !goToCheckout
    )

    if (goToCheckout) {
      router.push('/checkout')
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14 items-start">
      {/* Left Column: Multi-Angle Gallery */}
      <div className="md:col-span-6 space-y-4">
        <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden bg-secondary shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {images[activeImageIdx] ? (
            <Image
              src={images[activeImageIdx]}
              alt={product.title}
              fill
              priority
              loading="eager"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
              No Product Image
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="grid grid-cols-5 gap-3">
            {images.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveImageIdx(idx)}
                className={`relative aspect-square rounded-xl overflow-hidden bg-secondary transition-all cursor-pointer ${
                  activeImageIdx === idx
                    ? 'ring-2 ring-primary scale-[0.98]'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Image
                  src={url}
                  alt={`${product.title} view ${idx + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Column: Sizing, Pricing & Cart Actions */}
      <div className="md:col-span-6 space-y-6 pt-1">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary">
              <CheckCircle2 size={14} />
              {isAvailable ? `${maxStockForSelection} in stock (${selectedSize})` : 'Out of Stock'}
            </span>

            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-secondary">
              <span
                className="w-3 h-3 rounded-full border border-border"
                style={{ background: product.color_hex || '#18181b' }}
              />
              {product.primary_color || 'Black'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{product.title}</h1>

          <div className="flex items-baseline gap-3 pt-1">
            <span className="text-3xl font-extrabold text-primary">
              KES {effectivePrice.toLocaleString()}
            </span>
            {offerPrice !== null && (
              <span className="text-lg line-through text-muted-foreground font-semibold">
                KES {regularPrice.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Size & Variant Selector */}
        {variants.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold">
                Select Size / Fit: <span className="text-primary">{selectedSize}</span>
              </label>
              {currentVariant?.measurement && (
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Ruler size={13} className="text-primary" /> {currentVariant.measurement}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {variants.map((v) => {
                const hasStock = Number(v.stock) > 0
                const isSelected = selectedSize === v.size
                return (
                  <button
                    key={v.size}
                    type="button"
                    disabled={!hasStock}
                    onClick={() => {
                      setSelectedSize(v.size)
                      setQuantity(1)
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      !hasStock
                        ? 'bg-secondary/40 text-muted-foreground/40 line-through cursor-not-allowed'
                        : isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                        : 'bg-secondary hover:bg-secondary/80 text-foreground'
                    }`}
                  >
                    {v.size}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Measurement Guide Note */}
        {product.measurement_notes && (
          <div className="p-3.5 rounded-xl bg-secondary/50 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Ruler size={16} className="text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Fit & Sizing Note:</strong>{' '}
              {product.measurement_notes}
            </span>
          </div>
        )}

        {/* Quantity & Action Buttons */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold">Quantity:</span>
            <div className="inline-flex items-center gap-2 bg-secondary p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-card flex items-center justify-center cursor-pointer"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-bold text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxStockForSelection, q + 1))}
                disabled={quantity >= maxStockForSelection}
                className="w-8 h-8 rounded-lg bg-card flex items-center justify-center disabled:opacity-40 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="button"
              size="lg"
              disabled={!isAvailable}
              onClick={() => handleAddToCart(false)}
              className="h-12 rounded-xl font-bold shadow-lg shadow-primary/20 gap-2"
            >
              <ShoppingBag size={18} />
              {isAvailable ? 'Add to Bag' : 'Out of Stock'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={!isAvailable}
              onClick={() => handleAddToCart(true)}
              className="h-12 rounded-xl font-bold gap-2"
            >
              <Zap size={18} className="text-primary" />
              Buy Now with M-Pesa
            </Button>
          </div>
        </div>

        {/* Product Description */}
        <div className="prose prose-sm text-muted-foreground border-t border-b border-border/60 py-6">
          <p className="whitespace-pre-line leading-relaxed">
            {product.description || 'Crafted with heavyweight materials and contemporary streetwear tailoring.'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-secondary/60 flex items-center gap-3 text-xs text-muted-foreground">
          <PackageCheck size={18} className="text-primary shrink-0" />
          <span>
            Instant M-Pesa STK Push checkout & GPS-calculated delivery right to your doorstep.
          </span>
        </div>
      </div>
    </div>
  )
}
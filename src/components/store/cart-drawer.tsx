'use client'

import { useCart } from './cart-context'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { X, Plus, Minus, ShoppingBag, Trash2, ArrowRight, Sparkles } from 'lucide-react'

export function CartDrawer({ freeDeliveryThreshold = 15000 }: { freeDeliveryThreshold?: number | null }) {
  const {
    items,
    isOpen,
    closeCart,
    updateQuantity,
    removeItem,
    subtotal,
    totalSavings,
    totalItems,
  } = useCart()

  if (!isOpen) return null

  const threshold = Number(freeDeliveryThreshold) || 0
  const remainingForFreeDelivery = threshold > 0 ? Math.max(0, threshold - subtotal) : 0
  const progressPercent =
    threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 0

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={closeCart}
        className="fixed inset-0 bg-foreground/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-card text-card-foreground shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h2 className="font-bold text-lg tracking-tight">Your Drip Bag</h2>
                <p className="text-xs text-muted-foreground">
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} selected
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeCart}
              className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Free Delivery Progress Bar */}
          {threshold > 0 && items.length > 0 && (
            <div className="px-6 py-3 bg-secondary/50 border-b border-border/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                {remainingForFreeDelivery === 0 ? (
                  <span className="text-primary font-bold flex items-center gap-1">
                    <Sparkles size={13} /> You unlocked FREE delivery!
                  </span>
                ) : (
                  <span>
                    Add <strong className="text-foreground">KES {remainingForFreeDelivery.toLocaleString()}</strong> more for FREE delivery
                  </span>
                )}
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
                  <ShoppingBag size={28} />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-base">Your bag is empty</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Explore our latest streetwear, footwear, headwear, and bags to load up your cart.
                  </p>
                </div>
                <Link href="/shop" onClick={closeCart}>
                  <Button className="rounded-xl font-semibold mt-2">Explore Full Shop</Button>
                </Link>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.key}
                  className="p-3.5 rounded-2xl bg-secondary/40 flex gap-4 items-center"
                >
                  <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-secondary shrink-0">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                        No Img
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${item.productId}`}
                        onClick={closeCart}
                        className="font-bold text-sm truncate hover:text-primary transition-colors"
                      >
                        {item.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded-md bg-card font-semibold text-foreground">
                        Size: {item.selectedSize}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-border"
                          style={{ background: item.colorHex }}
                        />
                        {item.primaryColor}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="inline-flex items-center gap-1.5 bg-card px-1.5 py-1 rounded-xl shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.key, item.quantity - 1)}
                          className="w-6 h-6 rounded-lg hover:bg-secondary flex items-center justify-center cursor-pointer"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-2 text-xs font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.key, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="w-6 h-6 rounded-lg hover:bg-secondary flex items-center justify-center disabled:opacity-40 cursor-pointer"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="font-extrabold text-sm text-primary">
                          KES {(item.unitPrice * item.quantity).toLocaleString()}
                        </p>
                        {item.regularPrice > item.unitPrice && (
                          <p className="text-[10px] line-through text-muted-foreground">
                            KES {(item.regularPrice * item.quantity).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer / Checkout CTA */}
          {items.length > 0 && (
            <div className="p-6 border-t border-border/60 bg-card space-y-4">
              {totalSavings > 0 && (
                <div className="flex items-center justify-between text-xs font-semibold text-primary bg-primary/10 px-3 py-2 rounded-xl">
                  <span>Offer Savings Applied</span>
                  <span>-KES {totalSavings.toLocaleString()}</span>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between text-base font-extrabold">
                  <span>Subtotal</span>
                  <span>KES {subtotal.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exact GPS delivery fee is calculated on the next step via Google Maps.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <Link href="/checkout" onClick={closeCart} className="w-full">
                  <Button
                    size="lg"
                    className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20 gap-2 text-base"
                  >
                    Proceed to M-Pesa Checkout <ArrowRight size={18} />
                  </Button>
                </Link>
                <Link href="/shop" onClick={closeCart} className="w-full">
                  <Button variant="secondary" size="sm" className="w-full rounded-xl font-medium">
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
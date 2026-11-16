'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/store/cart-context'
import { GoogleMapPicker } from '@/components/store/google-map-picker'
import {
  SHOP_LOCATION,
  DELIVERY_TIERS,
  calculateDeliveryQuote,
} from '@/lib/geo/haversine'
import {
  processOrderAndInitiateMpesa,
  getPublicStoreDeliveryConfig,
} from './actions'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import {
  Smartphone,
  Truck,
  Store,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  MapPin,
  Sparkles,
} from 'lucide-react'

interface CheckoutStoreConfig {
  origin_address: string
  origin_lat: number
  origin_lng: number
  base_delivery_fee: number
  delivery_fee_per_km: number
  min_delivery_fee: number
  max_delivery_fee: number
  free_delivery_threshold: number
}

const DEFAULT_STORE_CONFIG: CheckoutStoreConfig = {
  origin_address: SHOP_LOCATION.name,
  origin_lat: Number(SHOP_LOCATION.lat),
  origin_lng: Number(SHOP_LOCATION.lng),
  base_delivery_fee: 150,
  delivery_fee_per_km: 35,
  min_delivery_fee: 150,
  max_delivery_fee: 1000,
  free_delivery_threshold: 15000,
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clearCart } = useCart()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryApartment, setDeliveryApartment] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: Number(SHOP_LOCATION.lat),
    lng: Number(SHOP_LOCATION.lng),
  })
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storeConfig, setStoreConfig] = useState<CheckoutStoreConfig>(DEFAULT_STORE_CONFIG)

  useEffect(() => {
    let active = true
    getPublicStoreDeliveryConfig().then((cfg) => {
      if (active && cfg) {
        setStoreConfig({
          origin_address: String(cfg.origin_address || SHOP_LOCATION.name),
          origin_lat: Number(SHOP_LOCATION.lat),
          origin_lng: Number(SHOP_LOCATION.lng),
          base_delivery_fee: Number(cfg.base_delivery_fee ?? 150),
          delivery_fee_per_km: Number(cfg.delivery_fee_per_km ?? 35),
          min_delivery_fee: Number(cfg.min_delivery_fee ?? 150),
          max_delivery_fee: Number(cfg.max_delivery_fee ?? 1000),
          free_delivery_threshold: Number(cfg.free_delivery_threshold ?? 15000),
        })
      }
    })
    return () => {
      active = false
    }
  }, [])

  // If the customer types an address directly into the street/landmark input without
  // clicking the map/search dropdown first, automatically geocode it to get coordinates
  useEffect(() => {
    if (deliveryMethod !== 'delivery' || hasSelectedLocation) return
    const q = deliveryAddress.trim()
    if (q.length < 4) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ke&limit=1&q=${encodeURIComponent(
            q
          )}`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }
        )
        if (!res.ok) return
        const data = (await res.json()) as Array<{ lat: string; lon: string }>
        if (data[0]) {
          const lat = Number(parseFloat(data[0].lat).toFixed(6))
          const lng = Number(parseFloat(data[0].lon).toFixed(6))
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setCoords({ lat, lng })
            setHasSelectedLocation(true)
          }
        }
      } catch {
        // Ignore abort/network errors
      }
    }, 600)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [deliveryAddress, deliveryMethod, hasSelectedLocation])

  const quote = useMemo(() => {
    if (deliveryMethod === 'pickup') {
      return calculateDeliveryQuote(coords, subtotal, storeConfig, 'pickup')
    }
    if (!hasSelectedLocation) {
      return {
        distanceKm: 0,
        deliveryFeeKes: 0,
        deliveryFeeCents: 0,
        isFreeDelivery: true,
        tier: DELIVERY_TIERS[0],
      }
    }
    return calculateDeliveryQuote(coords, subtotal, storeConfig, 'delivery')
  }, [coords, subtotal, storeConfig, deliveryMethod, hasSelectedLocation])

  const grandTotal = subtotal + quote.deliveryFeeKes

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
      setError('Please search or enter your delivery location.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await processOrderAndInitiateMpesa({
        customerName,
        customerPhone,
        customerEmail,
        deliveryMethod,
        deliveryAddress:
          deliveryMethod === 'pickup' ? 'Shop Pickup' : deliveryAddress,
        deliveryApartment,
        deliveryNotes,
        deliveryLat:
          deliveryMethod === 'pickup' ? Number(SHOP_LOCATION.lat) : coords.lat,
        deliveryLng:
          deliveryMethod === 'pickup' ? Number(SHOP_LOCATION.lng) : coords.lng,
        items: items.map((i) => ({
          productId: i.productId,
          selectedSize: i.selectedSize,
          quantity: i.quantity,
          variantId: i.key,
        })),
      })

      if (result.error) {
        setError(result.error)
        setIsSubmitting(false)
        return
      }

      clearCart()
      router.push(`/orders/${result.orderId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.')
      setIsSubmitting(false)
    }
  }

  const inputStyle =
    'h-11 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl'

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-extrabold">Your shopping bag is empty</h1>
        <p className="text-sm text-muted-foreground">
          Add some pieces from our catalog before proceeding to M-Pesa checkout.
        </p>
        <Link href="/shop">
          <Button className="rounded-xl font-semibold mt-2">Return to Shop</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <Link
        href="/shop"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Continue Shopping
      </Link>

      <form onSubmit={handleCheckoutSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT 7 COLUMNS: Contact, Location Search, Live GPS & Delivery Tiers */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
              <CardHeader className="px-7 pt-7 pb-4">
                <CardTitle className="text-lg font-bold">
                  1. Contact &amp; M-Pesa Number
                </CardTitle>
                <CardDescription>
                  We will send the Safaricom M-Pesa STK Push prompt directly to this phone number.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-7 pb-7 space-y-4">
                {error && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold ml-1">Full Name *</label>
                    <Input
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Brian Kamau"
                      className={inputStyle}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold ml-1">
                      M-Pesa Phone Number *
                    </label>
                    <Input
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0712 345 678"
                      className={inputStyle}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold ml-1">
                    Email Address (Optional for Receipt)
                  </label>
                  <Input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputStyle}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Delivery vs Pickup + Location Search + Live GPS + Tiered Pricing */}
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
              <CardHeader className="px-7 pt-7 pb-4">
                <CardTitle className="text-lg font-bold">
                  2. Delivery Location
                </CardTitle>
                <CardDescription>
                  Delivery within 10 km of our shop is FREE. Search your location or use your live GPS below.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-7 pb-7 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`p-4 rounded-2xl text-left transition-all flex items-center gap-3 cursor-pointer ${
                      deliveryMethod === 'delivery'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary/70 text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Truck size={20} />
                    <div>
                      <p className="font-bold text-sm">Doorstep Delivery</p>
                      <p className="text-[11px] opacity-80">
                        Free within 10 km of shop
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`p-4 rounded-2xl text-left transition-all flex items-center gap-3 cursor-pointer ${
                      deliveryMethod === 'pickup'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary/70 text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Store size={20} />
                    <div>
                      <p className="font-bold text-sm">Shop Pickup (Free)</p>
                      <p className="text-[11px] opacity-80">
                        Collect directly at the shop
                      </p>
                    </div>
                  </button>
                </div>

                {deliveryMethod === 'delivery' && (
                  <>
                    <GoogleMapPicker
                      coords={coords}
                      hasSelectedLocation={hasSelectedLocation}
                      onChange={(nextCoords, resolvedAddress) => {
                        setCoords(nextCoords)
                        setHasSelectedLocation(true)
                        if (resolvedAddress) {
                          setDeliveryAddress(resolvedAddress)
                        }
                      }}
                    />

                    {/* Delivery Pricing Tier Strip */}
                    <div className="p-4 rounded-2xl bg-primary/10 text-primary space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
                        <span className="flex items-center gap-1.5">
                          <MapPin size={15} />
                          {hasSelectedLocation
                            ? `Delivery Distance: ${quote.distanceKm} km (${quote.tier.label})`
                            : 'Select your delivery location above to calculate exact distance'}
                        </span>
                        {hasSelectedLocation && (
                          <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                            {quote.isFreeDelivery
                              ? 'FREE DELIVERY'
                              : `KES ${quote.deliveryFeeKes.toLocaleString()}`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1.5 pt-1">
                        {DELIVERY_TIERS.map((tier) => {
                          const isCurrent =
                            hasSelectedLocation && quote.tier.id === tier.id
                          return (
                            <div
                              key={tier.id}
                              className={`p-2 rounded-xl text-center transition-all ${
                                isCurrent
                                  ? 'bg-card text-foreground ring-2 ring-primary shadow-2xs'
                                  : 'bg-card/50 text-muted-foreground opacity-75'
                              }`}
                            >
                              <p className="text-[10px] font-bold truncate">
                                {tier.rangeLabel}
                              </p>
                              <p className="text-xs font-extrabold text-primary mt-0.5">
                                {tier.feeKes === 0 ? 'FREE' : `KES ${tier.feeKes}`}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold ml-1">
                          Delivery Street / Estate / Landmark *
                        </label>
                        <Input
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Enter your street, estate, or landmark"
                          className={inputStyle}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold ml-1">
                          Building / Apartment / Gate / Floor
                        </label>
                        <Input
                          value={deliveryApartment}
                          onChange={(e) => setDeliveryApartment(e.target.value)}
                          placeholder="e.g. Block B, Hse 14"
                          className={inputStyle}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold ml-1">
                        Rider Instructions (Optional)
                      </label>
                      <Textarea
                        rows={2}
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        placeholder="Gate code, stage name, or preferred delivery time..."
                        className="border-none bg-secondary/80 rounded-xl resize-none p-3 text-sm"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT 5 COLUMNS: Order Summary & M-Pesa Daraja Trigger */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
              <CardHeader className="px-7 pt-7 pb-4 border-b border-border/50">
                <CardTitle className="text-lg font-bold">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-7 space-y-6">
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-secondary shrink-0">
                          {item.imageUrl && (
                            <Image
                              src={item.imageUrl}
                              alt={item.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Size: {item.selectedSize} &bull; Qty: {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-xs shrink-0">
                        KES {(item.unitPrice * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2.5 pt-4 border-t border-border/60 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Items Subtotal</span>
                    <span className="font-semibold text-foreground">
                      KES {subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      Delivery (
                      {deliveryMethod === 'pickup'
                        ? 'Shop Pickup'
                        : hasSelectedLocation
                        ? `${quote.distanceKm} km`
                        : 'Select location'}
                      )
                    </span>
                    <span className="font-semibold text-foreground">
                      {deliveryMethod === 'pickup' || quote.deliveryFeeKes === 0 ? (
                        <span className="text-primary font-bold inline-flex items-center gap-1">
                          <Sparkles size={13} /> FREE
                        </span>
                      ) : (
                        `KES ${quote.deliveryFeeKes.toLocaleString()}`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-extrabold pt-2 border-t border-border/60">
                    <span>Total to Pay</span>
                    <span className="text-primary">
                      KES {grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full h-13 rounded-xl font-extrabold text-base shadow-lg shadow-primary/25 gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Sending M-Pesa STK Prompt...
                    </>
                  ) : (
                    <>
                      <Smartphone size={18} />
                      Pay KES {grandTotal.toLocaleString()} via M-Pesa
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground text-center">
                  <ShieldCheck size={14} className="text-primary shrink-0" />
                  <span>
                    Secured by Safaricom Daraja API. Stock is only deducted upon confirmed M-Pesa payment.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
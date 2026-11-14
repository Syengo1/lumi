'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/store/cart-context'
import { GoogleMapPicker } from '@/components/store/google-map-picker'
import { calculateDeliveryQuote } from '@/lib/geo/haversine'
import { processOrderAndInitiateMpesa, getPublicStoreDeliveryConfig } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
} from 'lucide-react'



const DEFAULT_STORE_CONFIG = {
  origin_lat: -1.286389,
  origin_lng: 36.817223,
  base_delivery_fee: 150,
  delivery_fee_per_km: 35,
  min_delivery_fee: 200,
  max_delivery_fee: 1500,
  free_delivery_threshold: 15000,
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clearCart } = useCart()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery')
  const [deliveryAddress, setDeliveryAddress] = useState('Westlands, Nairobi')
  const [deliveryApartment, setDeliveryApartment] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [coords, setCoords] = useState({ lat: -1.2683, lng: 36.8111 })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [storeConfig, setStoreConfig] = useState(DEFAULT_STORE_CONFIG)

  useEffect(() => {
    let active = true
    getPublicStoreDeliveryConfig().then((cfg) => {
      if (active && cfg) setStoreConfig(cfg)
    })
    return () => {
      active = false
    }
  }, [])

  const quote = useMemo(() => {
    return calculateDeliveryQuote(
      coords,
      subtotal,
      storeConfig,
      deliveryMethod
    )
  }, [coords, subtotal, storeConfig, deliveryMethod])

  const grandTotal = subtotal + quote.deliveryFeeKes

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const result = await processOrderAndInitiateMpesa({
        customerName,
        customerPhone,
        customerEmail,
        deliveryMethod,
        deliveryAddress:
          deliveryMethod === 'pickup' ? 'Store Pickup (Nairobi CBD)' : deliveryAddress,
        deliveryApartment,
        deliveryNotes,
        deliveryLat: coords.lat,
        deliveryLng: coords.lng,
        items: items.map((i) => ({
          productId: i.productId,
          selectedSize: i.selectedSize,
          quantity: i.quantity,
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
          {/* LEFT 7 COLUMNS: Customer, Delivery Method, Google Map & Address */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
              <CardHeader className="px-7 pt-7 pb-4">
                <CardTitle className="text-lg font-bold">1. Contact & M-Pesa Number</CardTitle>
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
                    <label className="text-xs font-bold ml-1">M-Pesa Phone Number *</label>
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
                  <label className="text-xs font-bold ml-1">Email Address (Optional for Receipt)</label>
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

            {/* Delivery vs Pickup + Google Maps Pin + Haversine */}
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
              <CardHeader className="px-7 pt-7 pb-4">
                <CardTitle className="text-lg font-bold">2. Delivery Location & GPS Pin</CardTitle>
                <CardDescription>
                  Delivery fee is calculated via Haversine distance from our Nairobi CBD dispatch hub.
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
                      <p className="text-[11px] opacity-80">Rider dispatched to your pin</p>
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
                      <p className="font-bold text-sm">Store Pickup (Free)</p>
                      <p className="text-[11px] opacity-80">Collect at Nairobi CBD</p>
                    </div>
                  </button>
                </div>

                {deliveryMethod === 'delivery' && (
                  <>
                    <GoogleMapPicker
                      coords={coords}
                      originCoords={{
                        lat: DEFAULT_STORE_CONFIG.origin_lat,
                        lng: DEFAULT_STORE_CONFIG.origin_lng,
                      }}
                      onChange={(nextCoords, zoneLabel) => {
                        setCoords(nextCoords)
                        if (zoneLabel) setDeliveryAddress(zoneLabel)
                      }}
                    />

                    <div className="p-3.5 rounded-xl bg-primary/10 text-primary flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={15} /> Haversine Distance: {quote.distanceKm} km from Dispatch
                      </span>
                      <span>
                        {quote.isFreeDelivery
                          ? 'FREE DELIVERY'
                          : `Delivery Fee: KES ${quote.deliveryFeeKes.toLocaleString()}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold ml-1">Street / Estate / Landmark *</label>
                        <Input
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="e.g. Ring Road Kilimani, near Yaya"
                          className={inputStyle}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold ml-1">Building / Apartment / Floor</label>
                        <Input
                          value={deliveryApartment}
                          onChange={(e) => setDeliveryApartment(e.target.value)}
                          placeholder="e.g. Block B, Hse 14"
                          className={inputStyle}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold ml-1">Rider Instructions (Optional)</label>
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
                    <div key={item.key} className="flex items-center justify-between gap-3">
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
                            Size: {item.selectedSize} • Qty: {item.quantity}
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
                      Delivery ({deliveryMethod === 'pickup' ? 'Pickup' : `${quote.distanceKm} km`})
                    </span>
                    <span className="font-semibold text-foreground">
                      {quote.deliveryFeeKes === 0
                        ? 'FREE'
                        : `KES ${quote.deliveryFeeKes.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="flex justify-between text-lg font-extrabold pt-2 border-t border-border/60">
                    <span>Total to Pay</span>
                    <span className="text-primary">KES {grandTotal.toLocaleString()}</span>
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
                    Secured by Safaricom Daraja API. Check your phone for the M-Pesa PIN pop-up.
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
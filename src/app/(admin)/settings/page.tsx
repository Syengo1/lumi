import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { updateStoreSettings } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Palette, Mail, Sparkles, Store, MapPin, Truck } from 'lucide-react'
import { connection } from 'next/server'

export const instant = false

export default async function SettingsPage() {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  const inputAesthetic =
    'h-11 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl'

  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Storefront, Brand & Delivery Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your global theme color, hero headline, dispatch hub GPS coordinates, and Haversine delivery pricing.
        </p>
      </div>

      <form action={updateStoreSettings} className="space-y-8">
        {/* 1. Brand & Theme Card */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
          <CardHeader className="px-8 pt-8 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Palette size={20} />
              </div>
              <div>
                <CardTitle className="text-lg">Theme & Brand Identity</CardTitle>
                <CardDescription>
                  Changes immediately apply across all storefront and admin pages for this store.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold ml-1 inline-flex items-center gap-1.5">
                  <Store size={15} className="text-primary" />
                  Store Name
                </label>
                <Input
                  name="name"
                  defaultValue={store?.name || 'Luminous Drip Line'}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold ml-1 inline-flex items-center gap-1.5">
                  <Mail size={15} className="text-primary" />
                  Customer Support & Order Email
                </label>
                <Input
                  type="email"
                  name="contact_email"
                  defaultValue={store?.contact_email || 'contact@luminousdrip.com'}
                  required
                  className={inputAesthetic}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold ml-1">Primary Theme Color (Hex)</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  name="primary_color"
                  defaultValue={store?.primary_color || '#f97316'}
                  className="h-11 w-20 rounded-xl cursor-pointer bg-secondary p-1 border-none"
                />
                <span className="text-sm text-muted-foreground">
                  Pick your signature brand color (Default Orange: <code className="font-mono">#f97316</code>)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold ml-1 inline-flex items-center gap-1.5">
                <Sparkles size={15} className="text-primary" />
                Storefront Hero Headline
              </label>
              <Input
                name="hero_banner_text"
                defaultValue={store?.hero_banner_text || 'Welcome to Luminous Drip Line'}
                required
                className={inputAesthetic}
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Dispatch Hub & Haversine Delivery Pricing Card */}
        <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
          <CardHeader className="px-8 pt-8 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Truck size={20} />
              </div>
              <div>
                <CardTitle className="text-lg">Dispatch Hub & Haversine Delivery Rates (KES)</CardTitle>
                <CardDescription>
                  Used by the server to calculate exact distance-based delivery fees at checkout.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="sm:col-span-1 space-y-2">
                <label className="text-sm font-semibold ml-1 inline-flex items-center gap-1.5">
                  <MapPin size={15} className="text-primary" />
                  Dispatch Hub Name
                </label>
                <Input
                  name="origin_address"
                  defaultValue={store?.origin_address || 'Nairobi CBD, Kenya'}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold ml-1">Hub Latitude</label>
                <Input
                  type="number"
                  step="any"
                  name="origin_lat"
                  defaultValue={store?.origin_lat ?? -1.286389}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold ml-1">Hub Longitude</label>
                <Input
                  type="number"
                  step="any"
                  name="origin_lng"
                  defaultValue={store?.origin_lng ?? 36.817223}
                  required
                  className={inputAesthetic}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold ml-1">Base Fee (KES)</label>
                <Input
                  type="number"
                  name="base_delivery_fee"
                  defaultValue={store?.base_delivery_fee ?? 150}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold ml-1">Per KM (KES)</label>
                <Input
                  type="number"
                  name="delivery_fee_per_km"
                  defaultValue={store?.delivery_fee_per_km ?? 35}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold ml-1">Min Fee (KES)</label>
                <Input
                  type="number"
                  name="min_delivery_fee"
                  defaultValue={store?.min_delivery_fee ?? 200}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold ml-1">Max Fee (KES)</label>
                <Input
                  type="number"
                  name="max_delivery_fee"
                  defaultValue={store?.max_delivery_fee ?? 1500}
                  required
                  className={inputAesthetic}
                />
              </div>

              <div className="space-y-2 col-span-2 sm:col-span-1">
                <label className="text-xs font-semibold ml-1">Free Above (KES)</label>
                <Input
                  type="number"
                  name="free_delivery_threshold"
                  defaultValue={store?.free_delivery_threshold ?? 15000}
                  required
                  className={inputAesthetic}
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button
                type="submit"
                size="lg"
                className="rounded-xl font-semibold shadow-md shadow-primary/20 px-8"
              >
                Save All Store Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
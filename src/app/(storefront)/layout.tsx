import '../globals.css'
import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { CartProvider } from '@/components/store/cart-context'
import { CartDrawer } from '@/components/store/cart-drawer'
import { StoreHeader } from '@/components/store/store-header'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { connection } from 'next/server'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'Luminous Drip Line | Official Storefront',
  description: 'Contemporary streetwear, footwear, headwear, and curated apparel in Kenya.',
}

export const instant = false

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()

  const storeName = store?.name || 'Luminous Drip Line'
  const contactEmail = store?.contact_email || 'contact@luminousdrip.com'
  const currentYear = new Date().getFullYear()

  return (
    <html
      lang="en"
      style={{
        '--primary': store?.primary_color || '#f97316',
      } as React.CSSProperties}
    >
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased`}>
        <CartProvider>
          <div className="min-h-screen flex flex-col">
            <StoreHeader storeName={storeName} />
            <CartDrawer freeDeliveryThreshold={store?.free_delivery_threshold ?? 15000} />

            <main className="flex-1">{children}</main>

            <footer className="bg-secondary/60 border-t border-border/60 mt-24">
              <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm text-muted-foreground">
                <div className="space-y-2">
                  <p className="font-extrabold text-base text-foreground">{storeName}</p>
                  <p className="text-xs leading-relaxed">
                    Elevated Kenyan streetwear, kicks, headwear & utility bags. Instant M-Pesa Daraja STK checkout & GPS doorstep delivery.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-bold text-foreground">Quick Links</p>
                  <ul className="space-y-1.5 text-xs">
                    <li>
                      <Link href="/shop" className="hover:text-primary">
                        Full Catalog & Filters
                      </Link>
                    </li>
                    <li>
                      <Link href="/shop?offer=true" className="hover:text-primary">
                        Promotional Offers
                      </Link>
                    </li>
                    <li>
                      <Link href="/checkout" className="hover:text-primary">
                        M-Pesa Checkout
                      </Link>
                    </li>
                  </ul>
                </div>

                <div className="space-y-2 md:text-right">
                  <p className="font-bold text-foreground">Customer Care</p>
                  <p className="text-xs">
                    Email:{' '}
                    <a href={`mailto:${contactEmail}`} className="text-primary font-semibold hover:underline">
                      {contactEmail}
                    </a>
                  </p>
                  <p className="text-xs">
                    © {currentYear} {storeName}. All prices in KES.
                  </p>
                </div>
              </div>
            </footer>
          </div>
        </CartProvider>
      </body>
    </html>
  )
}
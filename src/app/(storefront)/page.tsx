import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import {
  HeroSection,
  CategoryShowcaseSection,
  FeaturedOffersSection,
  ValuePropsBanner,
} from '@/components/store/home-sections'
import { ProductCard } from '@/components/store/product-card'
import { Button } from '@/components/ui/button'
import type { CategoryItem, ProductItem } from '@/lib/inventory/constants'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { connection } from 'next/server'

export const instant = false

export default async function StorefrontHome() {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const [{ data: store }, { data: products }, { data: categories }] = await Promise.all([
    supabase.from('stores').select('*').eq('id', storeId).maybeSingle(),
    supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true }),
  ])

  const activeProducts = (products as ProductItem[]) || []
  const storeCategories = (categories as CategoryItem[]) || []
  const storeName = store?.name || 'Luminous Drip Line'

  return (
    <div className="space-y-20">
      {/* 1. Hero Section */}
      <HeroSection
        storeName={storeName}
        heroHeadline={store?.hero_banner_text || `Welcome to ${storeName}`}
      />

      {/* 2. Category Silhouette Showcase */}
      <CategoryShowcaseSection categories={storeCategories} products={activeProducts} />

      {/* 3. Featured & Promotional Offer Drops */}
      <FeaturedOffersSection products={activeProducts} />

      {/* 4. Latest Arrivals Section */}
      <section id="collection" className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Fresh Inventory
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              Latest Arrivals
            </h2>
          </div>
          <Link href="/shop">
            <Button variant="secondary" className="rounded-xl font-semibold gap-1.5">
              Filter Full Shop <ArrowRight size={15} />
            </Button>
          </Link>
        </div>

        {activeProducts.length === 0 ? (
          <div className="rounded-2xl bg-secondary/40 p-16 text-center space-y-3">
            <p className="text-lg font-semibold">New collection dropping soon</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Our catalog is currently being updated. Check back shortly for the newest {storeName} releases.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {activeProducts.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* 5. M-Pesa & Haversine Delivery Guarantee Banner */}
      <ValuePropsBanner />
    </div>
  )
}
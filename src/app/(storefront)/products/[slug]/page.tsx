import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductDetailClient } from '@/components/store/product-detail-client'
import { ProductCard } from '@/components/store/product-card'
import type { ProductItem } from '@/lib/inventory/constants'
import { ArrowLeft } from 'lucide-react'
import { connection } from 'next/server'

export const instant = false

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await connection()

  const { slug } = await params
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', slug)
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle()

  if (!product) {
    notFound()
  }

  // Fetch related products in the same category or store
  const { data: related } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .neq('id', product.id)
    .limit(4)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-16">
      <div>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to Full Shop
        </Link>

        <ProductDetailClient product={product as ProductItem} />
      </div>

      {related && related.length > 0 && (
        <section className="pt-10 border-t border-border/60 space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">You May Also Like</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(related as ProductItem[]).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
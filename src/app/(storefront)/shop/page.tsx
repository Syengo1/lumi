import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { ShopClientView } from '@/components/store/shop-client-view'
import type { CategoryItem, ProductItem } from '@/lib/inventory/constants'
import { connection } from 'next/server'

export const instant = false

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; offer?: string }>
}) {
  await connection()

  const { category, offer } = await searchParams
  const supabase = await createClient()
  const storeId = getStoreId()

  const [{ data: products }, { data: categories }] = await Promise.all([
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

  return (
    <ShopClientView
      products={(products as ProductItem[]) || []}
      categories={(categories as CategoryItem[]) || []}
      initialCategory={category || 'all'}
      initialOfferOnly={offer === 'true'}
    />
  )
}
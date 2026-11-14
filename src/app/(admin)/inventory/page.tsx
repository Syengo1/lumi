import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { InventoryClientView } from '@/components/inventory/inventory-client-view'
import type { CategoryItem, ProductItem } from '@/lib/inventory/constants'
import { connection } from 'next/server'

export const instant = false

export default async function InventoryPage() {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true }),
  ])

  return (
    <InventoryClientView
      products={(products as ProductItem[]) || []}
      categories={(categories as CategoryItem[]) || []}
    />
  )
}
import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { createProduct } from '../actions'
import { ProductForm } from '@/components/inventory/product-form'
import type { CategoryItem } from '@/lib/inventory/constants'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'

export const instant = false

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>
}) {
  await connection()

  const { created } = await searchParams
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('store_id', storeId)
    .order('name', { ascending: true })

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-2">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-card">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Product</h1>
          <p className="text-sm text-muted-foreground">
            Add apparel, footwear, headwear, or bags with custom size matrices and KES profit tracking.
          </p>
        </div>
      </div>

      <ProductForm
        mode="create"
        categories={(categories as CategoryItem[]) || []}
        action={createProduct}
        showCreatedBanner={created === '1'}
      />
    </div>
  )
}
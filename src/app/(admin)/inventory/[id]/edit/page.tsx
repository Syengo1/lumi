import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { updateProduct } from '../../actions'
import { ProductForm } from '@/components/inventory/product-form'
import type { CategoryItem, ProductItem } from '@/lib/inventory/constants'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export const instant = false

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()

  const { id } = await params
  const supabase = await createClient()
  const storeId = getStoreId()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('store_id', storeId)
      .maybeSingle(),
    supabase
      .from('categories')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true }),
  ])

  if (!product) {
    notFound()
  }

  const updateWithId = updateProduct.bind(null, id)

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-2">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-card">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Product</h1>
          <p className="text-sm text-muted-foreground">Updating {product.title}</p>
        </div>
      </div>

      <ProductForm
        mode="edit"
        categories={(categories as CategoryItem[]) || []}
        initialProduct={product as ProductItem}
        action={updateWithId}
      />
    </div>
  )
}
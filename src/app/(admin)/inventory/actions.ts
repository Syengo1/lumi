'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ProductVariant, SizeSystemType } from '@/lib/inventory/constants'

async function requireStoreAdmin() {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (roleData?.role !== 'admin') {
    throw new Error('Unauthorized: Store administrator privileges required.')
  }

  return { supabase, storeId }
}

async function uploadMultipleImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  files: File[]
): Promise<string[]> {
  const validFiles = files.filter((file) => file && file.size > 0)
  if (validFiles.length === 0) return []

  const maxSize = 5 * 1024 * 1024 // 5MB per image
  for (const file of validFiles) {
    if (file.size > maxSize) {
      throw new Error(`Image "${file.name}" exceeds the 5MB limit.`)
    }
  }

  const uploadPromises = validFiles.map(async (file, index) => {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${storeId}/${Date.now()}_${index}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file)

    if (uploadError) {
      throw new Error(`Image upload failed (${file.name}): ${uploadError.message}`)
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath)

    return publicUrl
  })

  return Promise.all(uploadPromises)
}

function parseProductPayload(formData: FormData) {
  const is_featured = formData.get('is_featured') === 'true'
  const title = (formData.get('title') as string)?.trim()
  const sku = (formData.get('sku') as string)?.trim() || null
  const categoryIdRaw = (formData.get('category_id') as string)?.trim()
  const category_id = categoryIdRaw && categoryIdRaw !== 'none' ? categoryIdRaw : null

  const buy_price = Math.max(0, parseFloat((formData.get('buy_price') as string) || '0') || 0)
  const price = Math.max(0, parseFloat((formData.get('price') as string) || '0') || 0)
  const offerRaw = (formData.get('offer_price') as string)?.trim()
  const offer_price = offerRaw && parseFloat(offerRaw) > 0 ? parseFloat(offerRaw) : null

  const primary_color = (formData.get('primary_color') as string)?.trim() || 'Black'
  const color_hex = (formData.get('color_hex') as string)?.trim() || '#18181b'
  const size_type = ((formData.get('size_type') as string)?.trim() || 'apparel') as SizeSystemType
  const measurement_notes = (formData.get('measurement_notes') as string)?.trim() || null
  const description = (formData.get('description') as string)?.trim() || ''

  let variants: ProductVariant[] = []
  const variantsJson = formData.get('variants_json') as string
  if (variantsJson) {
    try {
      const parsed = JSON.parse(variantsJson)
      if (Array.isArray(parsed)) {
        variants = parsed
          .filter((v) => v && typeof v.size === 'string' && v.size.trim() !== '')
          .map((v) => ({
            size: String(v.size).trim(),
            stock: Math.max(0, parseInt(String(v.stock || 0), 10) || 0),
            measurement: v.measurement ? String(v.measurement).trim() : undefined,
          }))
      }
    } catch {
      variants = []
    }
  }

  const manualStock = parseInt((formData.get('stock_count') as string) || '0', 10)
  const variantStockSum = variants.reduce((sum, v) => sum + v.stock, 0)
  const stock_count = variants.length > 0 ? variantStockSum : isNaN(manualStock) ? 0 : manualStock

  return {
    title,
    sku,
    category_id,
    buy_price,
    price,
    offer_price,
    primary_color,
    color_hex,
    size_type,
    variants,
    measurement_notes,
    stock_count,
    description,
    is_featured,
  }
}

function revalidateStorePaths() {
  revalidatePath('/', 'layout')
  revalidatePath('/inventory')
  revalidatePath('/dashboard')
}

export async function createProduct(formData: FormData) {
  const { supabase, storeId } = await requireStoreAdmin()
  const payload = parseProductPayload(formData)

  const submitMode = (formData.get('submit_mode') as string) || 'publish'
  const is_active = submitMode !== 'draft'

  const files = formData.getAll('images') as File[]
  const uploadedUrls = await uploadMultipleImages(supabase, storeId, files)

  const { error: dbError } = await supabase.from('products').insert({
    store_id: storeId,
    ...payload,
    image_urls: uploadedUrls,
    is_active,
  })

  if (dbError) throw new Error(`Database insert failed: ${dbError.message}`)

  revalidateStorePaths()

  if (submitMode === 'publish_and_new') {
    redirect('/inventory/new?created=1')
  }

  redirect('/inventory')
}

export async function updateProduct(id: string, formData: FormData) {
  const { supabase, storeId } = await requireStoreAdmin()
  const payload = parseProductPayload(formData)

  const is_active = formData.get('is_active') === 'true'

  let existingImages: string[] = []
  const existingJson = formData.get('existing_images_json') as string
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson)
      if (Array.isArray(parsed)) existingImages = parsed
    } catch {
      existingImages = []
    }
  }

  const files = formData.getAll('images') as File[]
  const newUploadedUrls = await uploadMultipleImages(supabase, storeId, files)
  const combinedImages = [...existingImages, ...newUploadedUrls]

  const { error: dbError } = await supabase
    .from('products')
    .update({
      ...payload,
      image_urls: combinedImages,
      is_active,
    })
    .eq('id', id)
    .eq('store_id', storeId)

  if (dbError) throw new Error(`Product update failed: ${dbError.message}`)

  revalidateStorePaths()
  redirect('/inventory')
}

export async function adjustProductStock(id: string, nextStock: number) {
  const { supabase, storeId } = await requireStoreAdmin()
  const clamped = Math.max(0, Math.floor(nextStock))

  const { error } = await supabase
    .from('products')
    .update({ stock_count: clamped })
    .eq('id', id)
    .eq('store_id', storeId)

  if (error) throw new Error(`Stock update failed: ${error.message}`)

  revalidateStorePaths()
}

export interface BatchProductRowInput {
  title: string
  category_id: string | null
  primary_color: string
  color_hex: string
  size_type: SizeSystemType
  buy_price: number
  price: number
  offer_price: number | null
  stock_count: number
  sizes_csv: string // e.g., "S:5, M:10, L:5" or "41:2, 42:4, 43:3"
}

export async function createBatchProducts(rows: BatchProductRowInput[]) {
  const { supabase, storeId } = await requireStoreAdmin()

  const validRows = rows.filter((r) => r.title && r.title.trim().length > 0 && Number(r.price) >= 0)
  if (validRows.length === 0) {
    throw new Error('Please provide at least one valid product row.')
  }

  const insertPayloads = validRows.map((row) => {
    const variants: ProductVariant[] = []
    if (row.sizes_csv && row.sizes_csv.trim() !== '') {
      const parts = row.sizes_csv.split(',')
      for (const part of parts) {
        const [sizeRaw, stockRaw] = part.split(':')
        if (sizeRaw && sizeRaw.trim()) {
          variants.push({
            size: sizeRaw.trim(),
            stock: Math.max(0, parseInt((stockRaw || '1').trim(), 10) || 0),
          })
        }
      }
    }

    const totalVariantStock = variants.reduce((sum, v) => sum + v.stock, 0)
    const finalStock = variants.length > 0 ? totalVariantStock : Math.max(0, Number(row.stock_count) || 0)

    return {
      store_id: storeId,
      title: row.title.trim(),
      category_id: row.category_id && row.category_id !== 'none' ? row.category_id : null,
      primary_color: row.primary_color || 'Black',
      color_hex: row.color_hex || '#18181b',
      size_type: row.size_type || 'apparel',
      buy_price: Math.max(0, Number(row.buy_price) || 0),
      price: Math.max(0, Number(row.price) || 0),
      offer_price: row.offer_price && Number(row.offer_price) > 0 ? Number(row.offer_price) : null,
      stock_count: finalStock,
      variants,
      image_urls: [],
      is_active: true,
    }
  })

  const { error } = await supabase.from('products').insert(insertPayloads)
  if (error) throw new Error(`Batch creation failed: ${error.message}`)

  revalidateStorePaths()
  return { count: insertPayloads.length }
}

export async function deleteProduct(id: string) {
  const { supabase, storeId } = await requireStoreAdmin()

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('store_id', storeId)

  if (error) throw new Error(`Failed to delete product: ${error.message}`)

  revalidateStorePaths()
}
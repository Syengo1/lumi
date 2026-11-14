'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { MediaUploader } from './media-uploader'
import { PricingProfitCard } from './pricing-profit-card'
import { SizeStockMatrix } from './size-stock-matrix'
import {
  PRODUCT_COLORS,
  type CategoryItem,
  type ProductItem,
  type ProductVariant,
  type SizeSystemType,
} from '@/lib/inventory/constants'
import Link from 'next/link'
import { Check, Sparkles, Save, PlusCircle } from 'lucide-react'

interface ProductFormProps {
  mode: 'create' | 'edit'
  categories: CategoryItem[]
  initialProduct?: ProductItem
  action: (formData: FormData) => Promise<void>
  showCreatedBanner?: boolean
}

export function ProductForm({
  mode,
  categories,
  initialProduct,
  action,
  showCreatedBanner = false,
}: ProductFormProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialProduct?.category_id || (categories[0]?.id ?? 'none')
  )

  const initialSizeType: SizeSystemType =
    initialProduct?.size_type ||
    categories.find((c) => c.id === initialProduct?.category_id)?.size_type ||
    categories[0]?.size_type ||
    'apparel'

  const [sizeType, setSizeType] = useState<SizeSystemType>(initialSizeType)

  const [variants, setVariants] = useState<ProductVariant[]>(
    initialProduct?.variants && initialProduct.variants.length > 0
      ? initialProduct.variants
      : [
          { size: 'M', stock: 5 },
          { size: 'L', stock: 5 },
        ]
  )

  const [measurementNotes, setMeasurementNotes] = useState<string>(
    initialProduct?.measurement_notes || ''
  )

  const [selectedColor, setSelectedColor] = useState<{ name: string; hex: string }>({
    name: initialProduct?.primary_color || 'Black',
    hex: initialProduct?.color_hex || '#18181b',
  })

  const [buyPrice, setBuyPrice] = useState<number>(Number(initialProduct?.buy_price ?? 0))
  const [sellPrice, setSellPrice] = useState<number>(Number(initialProduct?.price ?? 0))
  const [offerPrice, setOfferPrice] = useState<number | null>(
    initialProduct?.offer_price ? Number(initialProduct.offer_price) : null
  )

  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)

  const handleCategoryChange = (newCategoryId: string) => {
    setSelectedCategoryId(newCategoryId)
    const matched = categories.find((c) => c.id === newCategoryId)
    if (matched && matched.size_type !== sizeType) {
      setSizeType(matched.size_type)
      // Automatically seed default sizes for the newly chosen category type
      if (matched.size_type === 'footwear') {
        setVariants([
          { size: '41', stock: 3 },
          { size: '42', stock: 4 },
          { size: '43', stock: 3 },
        ])
      } else if (matched.size_type === 'headwear') {
        setVariants([{ size: 'Adjustable (Snapback/Strap)', stock: 10 }])
      } else if (matched.size_type === 'bags') {
        setVariants([{ size: 'Medium', stock: 5, measurement: '40 x 30 x 15 cm' }])
      } else if (matched.size_type === 'waist') {
        setVariants([
          { size: 'W30', stock: 3 },
          { size: 'W32', stock: 5 },
          { size: 'W34', stock: 4 },
        ])
      } else if (matched.size_type === 'socks') {
        setVariants([
          { size: 'EU 39-42', stock: 6 },
          { size: 'EU 43-46', stock: 6 },
        ])
      } else {
        setVariants([
          { size: 'M', stock: 5 },
          { size: 'L', stock: 5 },
          { size: 'XL', stock: 4 },
        ])
      }
    }
  }

  const inputAesthetic =
    'h-11 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl'

  return (
    <form action={action} className="space-y-8">
      {showCreatedBanner && (
        <div className="p-4 rounded-2xl bg-primary/15 text-primary flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Sparkles size={18} />
            <span>Product saved! Ready to add the next item right away.</span>
          </div>
          <Link href="/inventory" className="text-xs font-bold underline">
            Return to Inventory List
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* LEFT 2 COLUMNS: Details, Category, Color, Sizing & Pricing */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl overflow-hidden">
            <CardHeader className="px-8 pt-8 pb-4">
              <CardTitle className="text-lg">General Information & Categorization</CardTitle>
            </CardHeader>

            <CardContent className="px-8 pb-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-sm font-semibold ml-1">Product Title</label>
                  <Input
                    name="title"
                    defaultValue={initialProduct?.title || ''}
                    required
                    placeholder="e.g., Luminous Heavyweight Drip Hoodie"
                    className={inputAesthetic}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold ml-1">SKU / Item Code</label>
                  <Input
                    name="sku"
                    defaultValue={initialProduct?.sku || ''}
                    placeholder="e.g., LDL-HD-001"
                    className={inputAesthetic}
                  />
                </div>
              </div>

              {/* Category & Visibility Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                <div className="space-y-2">
                  <label className="text-sm font-semibold ml-1">Homepage Spotlight</label>
                  <select
                    name="is_featured"
                    defaultValue={initialProduct?.is_featured ? 'true' : 'false'}
                    className="w-full h-11 px-3.5 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl text-sm font-semibold outline-none"
                  >
                    <option value="false">Standard Catalog Item</option>
                    <option value="true">Featured on Homepage</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold ml-1">Category</label>
                  <select
                    name="category_id"
                    value={selectedCategoryId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full h-11 px-3.5 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl text-sm font-semibold outline-none"
                  >
                    <option value="none">Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {mode === 'edit' && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold ml-1">Storefront Visibility</label>
                    <select
                      name="is_active"
                      defaultValue={initialProduct?.is_active ? 'true' : 'false'}
                      className="w-full h-11 px-3.5 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl text-sm font-semibold outline-none"
                    >
                      <option value="true">Active (Public on Storefront)</option>
                      <option value="false">Draft (Hidden)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Primary Color Swatch Selector */}
              <div className="space-y-2.5">
                <input type="hidden" name="primary_color" value={selectedColor.name} />
                <input type="hidden" name="color_hex" value={selectedColor.hex} />
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold ml-1">
                    Primary Item Color:{' '}
                    <span className="text-primary font-bold">{selectedColor.name}</span>
                  </label>
                  <span className="text-xs text-muted-foreground">Used for color sorting & filtering</span>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  {PRODUCT_COLORS.map((color) => {
                    const isSelected = selectedColor.name === color.name
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-foreground text-background shadow-xs ring-2 ring-primary'
                            : 'bg-secondary/70 text-foreground hover:bg-secondary'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-border shrink-0 flex items-center justify-center"
                          style={{ background: color.hex }}
                        >
                          {isSelected && (
                            <Check
                              size={10}
                              className={color.name === 'White' ? 'text-black' : 'text-white'}
                            />
                          )}
                        </span>
                        <span>{color.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-semibold ml-1">Description & Styling Notes</label>
                <Textarea
                  name="description"
                  rows={4}
                  defaultValue={initialProduct?.description || ''}
                  placeholder="Describe the fabric weight (e.g., 450 GSM French Terry), fit, materials, and care instructions..."
                  className="border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl resize-none p-3"
                />
              </div>
            </CardContent>
          </Card>

          {/* Dynamic Sizes & Measurements Matrix */}
          <SizeStockMatrix
            sizeType={sizeType}
            onSizeTypeChange={setSizeType}
            variants={variants}
            onVariantsChange={setVariants}
            measurementNotes={measurementNotes}
            onMeasurementNotesChange={setMeasurementNotes}
          />

          {/* Buy, Sell, Offer Price & Profit Engine */}
          <PricingProfitCard
            buyPrice={buyPrice}
            sellPrice={sellPrice}
            offerPrice={offerPrice}
            totalStock={totalStock}
            onBuyPriceChange={setBuyPrice}
            onSellPriceChange={setSellPrice}
            onOfferPriceChange={setOfferPrice}
          />
        </div>

        {/* RIGHT COLUMN: Multi-Image Uploader & Submit Actions */}
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-8">
          <MediaUploader initialImages={initialProduct?.image_urls || []} />

          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
            <CardContent className="p-6 space-y-3">
              {mode === 'create' ? (
                <>
                  <Button
                    type="submit"
                    name="submit_mode"
                    value="publish"
                    size="lg"
                    className="w-full rounded-xl font-semibold shadow-md shadow-primary/20 gap-2"
                  >
                    <Save size={17} />
                    Publish Product
                  </Button>

                  <Button
                    type="submit"
                    name="submit_mode"
                    value="publish_and_new"
                    variant="secondary"
                    size="lg"
                    className="w-full rounded-xl font-semibold gap-2"
                  >
                    <PlusCircle size={17} className="text-primary" />
                    Publish & Add Another
                  </Button>

                  <Button
                    type="submit"
                    name="submit_mode"
                    value="draft"
                    variant="ghost"
                    size="lg"
                    className="w-full rounded-xl font-medium text-muted-foreground"
                  >
                    Save as Draft
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full rounded-xl font-semibold shadow-md shadow-primary/20 gap-2"
                  >
                    <Save size={17} />
                    Save Changes
                  </Button>
                  <Link href="/inventory" className="block w-full">
                    <Button type="button" variant="secondary" size="lg" className="w-full rounded-xl">
                      Cancel
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
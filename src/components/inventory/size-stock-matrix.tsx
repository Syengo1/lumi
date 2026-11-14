'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SIZE_PRESETS,
  type SizeSystemType,
  type ProductVariant,
} from '@/lib/inventory/constants'
import { Plus, Minus, Ruler, Layers, Trash2 } from 'lucide-react'

interface SizeStockMatrixProps {
  sizeType: SizeSystemType
  onSizeTypeChange: (type: SizeSystemType) => void
  variants: ProductVariant[]
  onVariantsChange: (variants: ProductVariant[]) => void
  measurementNotes: string
  onMeasurementNotesChange: (notes: string) => void
}

export function SizeStockMatrix({
  sizeType,
  onSizeTypeChange,
  variants,
  onVariantsChange,
  measurementNotes,
  onMeasurementNotesChange,
}: SizeStockMatrixProps) {
  const [customSizeInput, setCustomSizeInput] = useState('')
  const preset = SIZE_PRESETS[sizeType] || SIZE_PRESETS.apparel

  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)

  const togglePresetSize = (sizeLabel: string) => {
    const exists = variants.some((v) => v.size === sizeLabel)
    if (exists) {
      onVariantsChange(variants.filter((v) => v.size !== sizeLabel))
    } else {
      onVariantsChange([...variants, { size: sizeLabel, stock: 5, measurement: '' }])
    }
  }

  const addAllPresetSizes = () => {
    const merged = [...variants]
    for (const s of preset.sizes) {
      if (!merged.some((v) => v.size === s)) {
        merged.push({ size: s, stock: 3, measurement: '' })
      }
    }
    onVariantsChange(merged)
  }

  const updateVariantStock = (sizeLabel: string, nextStock: number) => {
    onVariantsChange(
      variants.map((v) =>
        v.size === sizeLabel ? { ...v, stock: Math.max(0, nextStock) } : v
      )
    )
  }

  const updateVariantMeasurement = (sizeLabel: string, measurement: string) => {
    onVariantsChange(
      variants.map((v) => (v.size === sizeLabel ? { ...v, measurement } : v))
    )
  }

  const addCustomSize = () => {
    const trimmed = customSizeInput.trim()
    if (!trimmed) return
    if (!variants.some((v) => v.size.toLowerCase() === trimmed.toLowerCase())) {
      onVariantsChange([...variants, { size: trimmed, stock: 5, measurement: '' }])
    }
    setCustomSizeInput('')
  }

  const inputStyle =
    'h-10 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 transition-all rounded-xl text-sm'

  return (
    <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl overflow-hidden">
      <CardHeader className="px-8 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Sizes, Measurements & Stock Counter</CardTitle>
            <CardDescription>{preset.description}</CardDescription>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary font-bold text-sm self-start">
            Total Stock: {totalStock} units
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-8 pb-8 space-y-6">
        <input type="hidden" name="size_type" value={sizeType} />
        <input type="hidden" name="variants_json" value={JSON.stringify(variants)} />
        <input type="hidden" name="stock_count" value={totalStock} />

        {/* 1. Measurement System Switcher */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
            Measurement / Sizing Format
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {(Object.keys(SIZE_PRESETS) as SizeSystemType[]).map((key) => {
              const isSelected = sizeType === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSizeTypeChange(key)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {SIZE_PRESETS[key].label.split(' (')[0]}
                </button>
              )
            })}
          </div>
        </div>

        {/* 2. Quick-Toggle Size Chips */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold ml-1 flex items-center gap-1.5">
              <Layers size={15} className="text-primary" />
              Select Available Sizes (Click to toggle)
            </label>
            <button
              type="button"
              onClick={addAllPresetSizes}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              + Select All Preset Sizes
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {preset.sizes.map((sizeLabel) => {
              const active = variants.some((v) => v.size === sizeLabel)
              return (
                <button
                  key={sizeLabel}
                  type="button"
                  onClick={() => togglePresetSize(sizeLabel)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-foreground text-background shadow-xs'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {sizeLabel}
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. Custom Size / Fit Adder */}
        <div className="flex gap-2 max-w-md">
          <Input
            value={customSizeInput}
            onChange={(e) => setCustomSizeInput(e.target.value)}
            placeholder="Add custom size or fit (e.g. 47, Oversized, 35L)..."
            className={inputStyle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomSize()
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addCustomSize}
            className="rounded-xl h-10 px-4 font-semibold shrink-0"
          >
            Add Size
          </Button>
        </div>

        {/* 4. Per-Size Stock Counter & Specific Measurements Table */}
        {variants.length > 0 ? (
          <div className="space-y-2.5 pt-2">
            <div className="grid grid-cols-12 gap-3 px-3 text-xs font-semibold text-muted-foreground">
              <div className="col-span-4">Size / Variant</div>
              <div className="col-span-4">Stock Quantity</div>
              <div className="col-span-3">Measurement Note</div>
              <div className="col-span-1 text-right"></div>
            </div>

            <div className="space-y-2">
              {variants.map((variant) => (
                <div
                  key={variant.size}
                  className="grid grid-cols-12 gap-3 items-center p-2.5 rounded-xl bg-secondary/50"
                >
                  <div className="col-span-4 font-bold text-sm pl-1 truncate">
                    {variant.size}
                  </div>

                  {/* Interactive Stock Counter */}
                  <div className="col-span-4 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateVariantStock(variant.size, variant.stock - 1)}
                      className="w-8 h-8 rounded-lg bg-card hover:bg-secondary flex items-center justify-center text-foreground shadow-2xs cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                    <Input
                      type="number"
                      min="0"
                      value={variant.stock}
                      onChange={(e) =>
                        updateVariantStock(variant.size, parseInt(e.target.value, 10) || 0)
                      }
                      className="h-8 w-16 text-center font-bold bg-card border-none rounded-lg px-1"
                    />
                    <button
                      type="button"
                      onClick={() => updateVariantStock(variant.size, variant.stock + 1)}
                      className="w-8 h-8 rounded-lg bg-card hover:bg-secondary flex items-center justify-center text-foreground shadow-2xs cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Specific Dimension/Fit Note */}
                  <div className="col-span-3">
                    <Input
                      value={variant.measurement || ''}
                      onChange={(e) => updateVariantMeasurement(variant.size, e.target.value)}
                      placeholder={preset.measurementPlaceholder}
                      className="h-8 bg-card border-none rounded-lg text-xs px-2.5"
                    />
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => togglePresetSize(variant.size)}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-secondary/40 text-center text-sm text-muted-foreground">
            Click one or more sizes above to set stock quantities for each size.
          </div>
        )}

        {/* 5. Overall Fit / Measurement Guide Note */}
        <div className="space-y-2 pt-2">
          <label className="text-sm font-semibold ml-1 flex items-center gap-1.5">
            <Ruler size={15} className="text-primary" />
            Fit & Measurement Guide (Optional)
          </label>
          <Input
            name="measurement_notes"
            value={measurementNotes}
            onChange={(e) => onMeasurementNotesChange(e.target.value)}
            placeholder="e.g., Relaxed boxy streetwear fit — model is 5'11 wearing size L, or Bag fits a 16-inch laptop"
            className={inputStyle}
          />
        </div>
      </CardContent>
    </Card>
  )
}
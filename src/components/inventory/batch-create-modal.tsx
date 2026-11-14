'use client'

import { useState } from 'react'
import { createBatchProducts, type BatchProductRowInput } from '@/app/(admin)/inventory/actions'
import {
  PRODUCT_COLORS,
  type CategoryItem,
  type SizeSystemType,
} from '@/lib/inventory/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Layers, Plus, Trash2, X, CheckCircle2 } from 'lucide-react'

interface BatchCreateModalProps {
  categories: CategoryItem[]
}

export function BatchCreateModal({ categories }: BatchCreateModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultCat = categories[0]

  const createEmptyRow = (): BatchProductRowInput => ({
    title: '',
    category_id: defaultCat?.id || null,
    primary_color: 'Black',
    color_hex: '#18181b',
    size_type: defaultCat?.size_type || 'apparel',
    buy_price: 0,
    price: 0,
    offer_price: null,
    stock_count: 10,
    sizes_csv: 'M:5, L:5',
  })

  const [rows, setRows] = useState<BatchProductRowInput[]>([
    createEmptyRow(),
    createEmptyRow(),
    createEmptyRow(),
  ])

  const updateRow = <K extends keyof BatchProductRowInput>(
    index: number,
    key: K,
    value: BatchProductRowInput[K]
  ) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const handleCategorySelect = (index: number, catId: string) => {
    const matched = categories.find((c) => c.id === catId)
    const sizeType: SizeSystemType = matched?.size_type || 'apparel'
    let defaultCsv = 'M:5, L:5'
    if (sizeType === 'footwear') defaultCsv = '41:2, 42:4, 43:3'
    if (sizeType === 'headwear') defaultCsv = 'Adjustable:10'
    if (sizeType === 'bags') defaultCsv = 'Medium:5'
    if (sizeType === 'waist') defaultCsv = 'W32:4, W34:4'

    setRows((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        category_id: catId,
        size_type: sizeType,
        sizes_csv: defaultCsv,
      }
      return next
    })
  }

  const handleColorSelect = (index: number, colorName: string) => {
    const found = PRODUCT_COLORS.find((c) => c.name === colorName)
    setRows((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        primary_color: colorName,
        color_hex: found?.hex || '#18181b',
      }
      return next
    })
  }

  const handleBatchSave = async () => {
    setError(null)
    setIsSubmitting(true)
    try {
      await createBatchProducts(rows)
      setIsOpen(false)
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch creation failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className="gap-2 rounded-xl font-semibold"
      >
        <Layers size={16} className="text-primary" />
        Quick Batch Add
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  Rapid Multi-Item Batch Creator
                </h2>
                <p className="text-xs text-muted-foreground">
                  Create multiple products at a go with categories, colors, buy/sell/offer prices, and size stock breakdowns.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-xs font-semibold text-muted-foreground text-left">
                      <th className="px-2">Product Title *</th>
                      <th className="px-2">Category</th>
                      <th className="px-2">Primary Color</th>
                      <th className="px-2">Buy (KES)</th>
                      <th className="px-2">Sell (KES) *</th>
                      <th className="px-2">Offer (KES)</th>
                      <th className="px-2">Sizes & Stock (Size:Qty)</th>
                      <th className="px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} className="bg-secondary/50 rounded-xl">
                        <td className="p-1.5">
                          <Input
                            value={row.title}
                            onChange={(e) => updateRow(idx, 'title', e.target.value)}
                            placeholder="e.g. Vintage Cargo Pant"
                            className="h-9 bg-card border-none rounded-lg"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={row.category_id || 'none'}
                            onChange={(e) => handleCategorySelect(idx, e.target.value)}
                            className="h-9 px-2.5 bg-card rounded-lg text-xs font-medium outline-none w-full"
                          >
                            <option value="none">Uncategorized</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select
                            value={row.primary_color}
                            onChange={(e) => handleColorSelect(idx, e.target.value)}
                            className="h-9 px-2.5 bg-card rounded-lg text-xs font-medium outline-none w-full"
                          >
                            {PRODUCT_COLORS.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5 w-28">
                          <Input
                            type="number"
                            min="0"
                            value={row.buy_price || ''}
                            onChange={(e) =>
                              updateRow(idx, 'buy_price', parseFloat(e.target.value) || 0)
                            }
                            placeholder="1800"
                            className="h-9 bg-card border-none rounded-lg"
                          />
                        </td>
                        <td className="p-1.5 w-28">
                          <Input
                            type="number"
                            min="0"
                            value={row.price || ''}
                            onChange={(e) =>
                              updateRow(idx, 'price', parseFloat(e.target.value) || 0)
                            }
                            placeholder="3500"
                            className="h-9 bg-card border-none rounded-lg"
                          />
                        </td>
                        <td className="p-1.5 w-28">
                          <Input
                            type="number"
                            min="0"
                            value={row.offer_price ?? ''}
                            onChange={(e) =>
                              updateRow(
                                idx,
                                'offer_price',
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            placeholder="3000"
                            className="h-9 bg-card border-none rounded-lg"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.sizes_csv}
                            onChange={(e) => updateRow(idx, 'sizes_csv', e.target.value)}
                            placeholder="S:3, M:5, L:4 or 42:3, 43:5"
                            className="h-9 bg-card border-none rounded-lg text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((prev) =>
                                prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                              )
                            }
                            className="p-1.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRows((prev) => [...prev, createEmptyRow()])}
                className="rounded-xl gap-1.5"
              >
                <Plus size={15} /> Add Another Row
              </Button>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Tip: You can upload photos for batch items anytime via Edit.
              </span>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleBatchSave}
                  className="rounded-xl font-semibold shadow-md shadow-primary/20 gap-2"
                >
                  <CheckCircle2 size={16} />
                  {isSubmitting ? 'Creating Items...' : 'Create All Items'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
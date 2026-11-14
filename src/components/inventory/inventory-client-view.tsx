'use client'

import { useState, useMemo, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  calculateProductFinancials,
  PRODUCT_COLORS,
  type CategoryItem,
  type ProductItem,
} from '@/lib/inventory/constants'
import { adjustProductStock, deleteProduct } from '@/app/(admin)/inventory/actions'
import { BatchCreateModal } from './batch-create-modal'
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Minus,
  TrendingUp,
  Wallet,
  Package,
  Coins,
} from 'lucide-react'

interface InventoryClientViewProps {
  products: ProductItem[]
  categories: CategoryItem[]
}

export function InventoryClientView({ products, categories }: InventoryClientViewProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedColor, setSelectedColor] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'profit_desc' | 'stock_asc'>('newest')
  const [isPending, startTransition] = useTransition()

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryItem>()
    categories.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory !== 'all' && p.category_id !== selectedCategory) return false
        if (selectedColor !== 'all' && p.primary_color !== selectedColor) return false
        if (search.trim() !== '') {
          const q = search.toLowerCase()
          const matchTitle = p.title.toLowerCase().includes(q)
          const matchSku = (p.sku || '').toLowerCase().includes(q)
          const matchColor = (p.primary_color || '').toLowerCase().includes(q)
          if (!matchTitle && !matchSku && !matchColor) return false
        }
        return true
      })
      .sort((a, b) => {
        const finA = calculateProductFinancials(a.buy_price, a.price, a.offer_price, a.stock_count)
        const finB = calculateProductFinancials(b.buy_price, b.price, b.offer_price, b.stock_count)

        if (sortBy === 'price_asc') return finA.effectivePrice - finB.effectivePrice
        if (sortBy === 'price_desc') return finB.effectivePrice - finA.effectivePrice
        if (sortBy === 'profit_desc') return finB.unitProfit - finA.unitProfit
        if (sortBy === 'stock_asc') return (a.stock_count ?? 0) - (b.stock_count ?? 0)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [products, selectedCategory, selectedColor, search, sortBy])

  // Aggregate financial KPIs across filtered products
  const portfolioSummary = useMemo(() => {
    return filteredProducts.reduce(
      (acc, p) => {
        const fin = calculateProductFinancials(p.buy_price, p.price, p.offer_price, p.stock_count)
        acc.totalUnits += Math.max(0, Number(p.stock_count) || 0)
        acc.totalCost += fin.totalInventoryCost
        acc.projectedRevenue += fin.projectedRevenue
        acc.projectedProfit += fin.projectedProfit
        return acc
      },
      { totalUnits: 0, totalCost: 0, projectedRevenue: 0, projectedProfit: 0 }
    )
  }, [filteredProducts])

  const handleStockStep = (id: string, currentStock: number, delta: number) => {
    startTransition(async () => {
      await adjustProductStock(id, Math.max(0, currentStock + delta))
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteProduct(id)
    })
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Header & Rapid Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory & Profit Control</h1>
          <p className="text-sm text-muted-foreground">
            Manage apparel, footwear, headwear & bags with size matrices, color sorting, and live KES margins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <BatchCreateModal categories={categories} />
          <Link href="/inventory/new">
            <Button className="gap-2 rounded-xl font-semibold shadow-md shadow-primary/20">
              <Plus size={16} />
              Add New Item
            </Button>
          </Link>
        </div>
      </div>

      {/* Financial & Stock Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Stock Units
            </p>
            <p className="text-2xl font-extrabold mt-1">
              {portfolioSummary.totalUnits.toLocaleString()} pcs
            </p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Package size={20} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Stock Buy Cost
            </p>
            <p className="text-2xl font-extrabold mt-1">
              KES {portfolioSummary.totalCost.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-secondary text-foreground">
            <Coins size={20} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Projected Revenue
            </p>
            <p className="text-2xl font-extrabold mt-1">
              KES {portfolioSummary.projectedRevenue.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Wallet size={20} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Projected Net Profit
            </p>
            <p className="text-2xl font-extrabold text-primary mt-1">
              KES {portfolioSummary.projectedProfit.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Filter & Color Sorting Bar */}
      <div className="p-4 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, SKU, or color..."
              className="h-10 pl-10 border-none bg-secondary/70 rounded-xl text-sm"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 px-3.5 bg-secondary/70 rounded-xl text-sm font-medium outline-none"
          >
            <option value="all">All Categories ({products.length})</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-10 px-3.5 bg-secondary/70 rounded-xl text-sm font-medium outline-none"
          >
            <option value="newest">Sort: Newest Added</option>
            <option value="profit_desc">Sort: Highest Unit Profit</option>
            <option value="price_desc">Sort: Price (High to Low)</option>
            <option value="price_asc">Sort: Price (Low to High)</option>
            <option value="stock_asc">Sort: Low Stock First</option>
          </select>
        </div>

        {/* Color Filter Swatches */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-muted-foreground shrink-0 mr-1">
            Color Filter:
          </span>
          <button
            type="button"
            onClick={() => setSelectedColor('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer ${
              selectedColor === 'all'
                ? 'bg-foreground text-background'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            All Colors
          </button>
          {PRODUCT_COLORS.map((c) => {
            const active = selectedColor === c.name
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedColor(active ? 'all' : c.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-secondary/70 text-foreground hover:bg-secondary'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-border"
                  style={{ background: c.hex }}
                />
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-[72px] pl-4">Media</TableHead>
              <TableHead>Item & Category</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Sizes & Measurements</TableHead>
              <TableHead>Stock Counter</TableHead>
              <TableHead className="text-right">Buy / Sell / Offer</TableHead>
              <TableHead className="text-right">Profit & Margin</TableHead>
              <TableHead className="text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredProducts.map((product) => {
              const fin = calculateProductFinancials(
                product.buy_price,
                product.price,
                product.offer_price,
                product.stock_count
              )
              const cat = product.category_id ? categoryMap.get(product.category_id) : null
              const variants = Array.isArray(product.variants) ? product.variants : []

              return (
                <TableRow key={product.id} className="border-border/50">
                  {/* Thumbnail + Photo Count Badge */}
                  <TableCell className="pl-4 py-3">
                    <div className="relative w-12 h-12">
                      {product.image_urls?.[0] ? (
                        <Image
                          src={product.image_urls[0]}
                          alt={product.title}
                          width={48}
                          height={48}
                          className="rounded-xl object-cover h-12 w-12 bg-secondary"
                          unoptimized
                        />
                      ) : (
                        <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-[10px] text-muted-foreground">
                          N/A
                        </div>
                      )}
                      {(product.image_urls?.length || 0) > 1 && (
                        <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-md bg-foreground text-background text-[10px] font-bold">
                          +{product.image_urls.length - 1}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Product Title, SKU & Category */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{product.title}</p>
                      {!product.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-muted-foreground">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{cat?.name || 'Uncategorized'}</span>
                      {product.sku && <span>• SKU: {product.sku}</span>}
                    </div>
                  </TableCell>

                  {/* Primary Color Swatch */}
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/70 text-xs font-medium">
                      <span
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ background: product.color_hex || '#18181b' }}
                      />
                      <span>{product.primary_color || 'Black'}</span>
                    </div>
                  </TableCell>

                  {/* Sizes Breakdown */}
                  <TableCell>
                    {variants.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[210px]">
                        {variants.map((v) => (
                          <span
                            key={v.size}
                            className="px-2 py-0.5 rounded-md bg-secondary text-[11px] font-semibold"
                            title={v.measurement || undefined}
                          >
                            {v.size}: <span className="text-primary">{v.stock}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Standard</span>
                    )}
                  </TableCell>

                  {/* Quick Stock Counter */}
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 bg-secondary/60 p-1 rounded-xl">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStockStep(product.id, product.stock_count ?? 0, -1)}
                        className="w-6 h-6 rounded-lg bg-card hover:bg-secondary flex items-center justify-center text-xs cursor-pointer"
                      >
                        <Minus size={12} />
                      </button>
                      <span
                        className={`px-2 text-xs font-bold ${
                          (product.stock_count ?? 0) <= 3 ? 'text-destructive' : ''
                        }`}
                      >
                        {product.stock_count ?? 0}
                      </span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStockStep(product.id, product.stock_count ?? 0, 1)}
                        className="w-6 h-6 rounded-lg bg-card hover:bg-secondary flex items-center justify-center text-xs cursor-pointer"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </TableCell>

                  {/* Buy, Sell & Offer Prices */}
                  <TableCell className="text-right">
                    {fin.offer !== null && fin.offer < fin.regular ? (
                      <div>
                        <span className="text-xs line-through text-muted-foreground mr-1.5">
                          KES {fin.regular.toLocaleString()}
                        </span>
                        <span className="font-extrabold text-primary">
                          KES {fin.offer.toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <p className="font-bold">KES {fin.regular.toLocaleString()}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Buy: KES {fin.cost.toLocaleString()}
                    </p>
                  </TableCell>

                  {/* Unit Profit, Margin & Projected Revenue */}
                  <TableCell className="text-right">
                    <p
                      className={`font-bold text-sm ${
                        fin.unitProfit >= 0 ? 'text-foreground' : 'text-destructive'
                      }`}
                    >
                      +KES {fin.unitProfit.toLocaleString()}{' '}
                      <span className="text-xs text-primary font-semibold">
                        ({fin.profitMargin}%)
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Rev: KES {fin.projectedRevenue.toLocaleString()}
                    </p>
                  </TableCell>

                  {/* Edit & Delete Actions */}
                  <TableCell className="text-right pr-4">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Link href={`/inventory/${product.id}/edit`}>
                        <Button variant="ghost" size="icon" className="rounded-xl">
                          <Edit size={16} className="text-muted-foreground hover:text-foreground" />
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => handleDelete(product.id)}
                        className="rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}

            {filteredProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No matching items found. Try clearing your filters or click &quot;Add New Item&quot;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
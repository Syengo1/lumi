'use client'

import { useState, useMemo } from 'react'
import { ProductCard } from './product-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  PRODUCT_COLORS,
  type CategoryItem,
  type ProductItem,
} from '@/lib/inventory/constants'
import { Search, SlidersHorizontal, X } from 'lucide-react'

interface ShopClientViewProps {
  products: ProductItem[]
  categories: CategoryItem[]
  initialCategory?: string
  initialOfferOnly?: boolean
}

export function ShopClientView({
  products,
  categories,
  initialCategory = 'all',
  initialOfferOnly = false,
}: ShopClientViewProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [selectedColor, setSelectedColor] = useState('all')
  const [selectedSize, setSelectedSize] = useState('all')
  const [offerOnly, setOfferOnly] = useState(initialOfferOnly)
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest')

  // Extract all unique available sizes across current products
  const allAvailableSizes = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (Array.isArray(p.variants)) {
        p.variants.forEach((v) => {
          if (Number(v.stock) > 0 && v.size) set.add(v.size)
        })
      }
    })
    return Array.from(set)
  }, [products])

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory !== 'all' && p.category_id !== selectedCategory) return false
        if (selectedColor !== 'all' && p.primary_color !== selectedColor) return false
        if (offerOnly) {
          const hasOffer =
            p.offer_price && Number(p.offer_price) > 0 && Number(p.offer_price) < Number(p.price)
          if (!hasOffer) return false
        }
        if (selectedSize !== 'all') {
          const variants = Array.isArray(p.variants) ? p.variants : []
          const hasSizeInStock = variants.some(
            (v) => v.size === selectedSize && Number(v.stock) > 0
          )
          if (!hasSizeInStock) return false
        }
        if (search.trim() !== '') {
          const q = search.toLowerCase()
          const matchTitle = p.title.toLowerCase().includes(q)
          const matchDesc = (p.description || '').toLowerCase().includes(q)
          const matchColor = (p.primary_color || '').toLowerCase().includes(q)
          if (!matchTitle && !matchDesc && !matchColor) return false
        }
        return true
      })
      .sort((a, b) => {
        const priceA =
          a.offer_price && Number(a.offer_price) < Number(a.price)
            ? Number(a.offer_price)
            : Number(a.price)
        const priceB =
          b.offer_price && Number(b.offer_price) < Number(b.price)
            ? Number(b.offer_price)
            : Number(b.price)

        if (sortBy === 'price_asc') return priceA - priceB
        if (sortBy === 'price_desc') return priceB - priceA
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [products, selectedCategory, selectedColor, selectedSize, offerOnly, search, sortBy])

  const resetFilters = () => {
    setSearch('')
    setSelectedCategory('all')
    setSelectedColor('all')
    setSelectedSize('all')
    setOfferOnly(false)
    setSortBy('newest')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Full Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filter by category, size, primary color, or promotional offers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hoodies, kicks, caps..."
              className="h-11 pl-10 border-none bg-secondary/80 rounded-xl text-sm"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-11 px-3.5 bg-secondary/80 rounded-xl text-xs font-bold outline-none shrink-0"
          >
            <option value="newest">Newest Arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Interactive Filter Console */}
      <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 mr-1 shrink-0">
            <SlidersHorizontal size={13} /> Category:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)
              }
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.name}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setOfferOnly((prev) => !prev)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ml-auto ${
              offerOnly
                ? 'bg-foreground text-background'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            🔥 On Offer Only
          </button>
        </div>

        {/* Size & Color Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          {/* Color Swatches */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-muted-foreground mr-1 shrink-0">Color:</span>
            <button
              type="button"
              onClick={() => setSelectedColor('all')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                selectedColor === 'all'
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              All
            </button>
            {PRODUCT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedColor(selectedColor === c.name ? 'all' : c.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 cursor-pointer ${
                  selectedColor === c.name
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/70 text-foreground hover:bg-secondary'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-border"
                  style={{ background: c.hex }}
                />
                <span>{c.name}</span>
              </button>
            ))}
          </div>

          {/* Size Filter */}
          {allAvailableSizes.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-bold text-muted-foreground mr-1 shrink-0">Size:</span>
              <button
                type="button"
                onClick={() => setSelectedSize('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                  selectedSize === 'all'
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                Any Size
              </button>
              {allAvailableSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(selectedSize === size ? 'all' : size)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                    selectedSize === size
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/70 text-foreground hover:bg-secondary'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results Count & Active Filter Reset */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{filteredProducts.length}</strong> of{' '}
          {products.length} products
        </span>
        {(selectedCategory !== 'all' ||
          selectedColor !== 'all' ||
          selectedSize !== 'all' ||
          offerOnly ||
          search !== '') && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-primary font-bold hover:underline cursor-pointer"
          >
            <X size={13} /> Clear All Filters
          </button>
        )}
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="p-16 rounded-2xl bg-secondary/40 text-center space-y-3">
          <p className="font-bold text-lg">No matching pieces found</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Try clearing your size or color filter to see more items from our collection.
          </p>
          <Button onClick={resetFilters} variant="secondary" className="rounded-xl mt-2">
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
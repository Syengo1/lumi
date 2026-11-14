export type SizeSystemType =
  | 'apparel'
  | 'footwear'
  | 'waist'
  | 'headwear'
  | 'bags'
  | 'socks'
  | 'one_size'

export interface ProductVariant {
  size: string
  stock: number
  measurement?: string
}

export interface CategoryItem {
  id: string
  name: string
  slug: string
  size_type: SizeSystemType
}

export interface ProductItem {
  id: string
  store_id: string
  category_id: string | null
  sku: string | null
  title: string
  description: string | null
  buy_price: number
  price: number
  offer_price: number | null
  stock_count: number
  primary_color: string
  color_hex: string
  size_type: SizeSystemType
  variants: ProductVariant[]
  measurement_notes: string | null
  image_urls: string[]
  is_active: boolean
  is_featured: boolean
  created_at: string
}

export const SIZE_PRESETS: Record<
  SizeSystemType,
  { label: string; description: string; sizes: string[]; measurementPlaceholder: string }
> = {
  apparel: {
    label: 'Apparel (Alpha Sizes)',
    description: 'Standard letter sizing for T-Shirts, Hoodies, Shirts & Jackets',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
    measurementPlaceholder: 'Chest / Length (e.g. Chest 42")',
  },
  footwear: {
    label: 'Footwear (EU Numerical)',
    description: 'Numerical shoe sizes for Sneakers, Boots & Slides',
    sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
    measurementPlaceholder: 'Insole CM / UK Size (e.g. 27.5cm)',
  },
  waist: {
    label: 'Trousers, Jeans & Shorts (Waist)',
    description: 'Waist measurements in inches or standard alpha',
    sizes: ['W28', 'W30', 'W32', 'W34', 'W36', 'W38', 'W40', 'S', 'M', 'L', 'XL'],
    measurementPlaceholder: 'Inseam / Length (e.g. L32)',
  },
  headwear: {
    label: 'Headwear (Caps, Beanies & Bucket Hats)',
    description: 'Fitted, snapback, strapback, and circumference sizes',
    sizes: [
      'Adjustable (Snapback/Strap)',
      'One Size Fits All',
      'Fitted S/M (56-57cm)',
      'Fitted L/XL (58-60cm)',
      'Fitted 7 (55.8cm)',
      'Fitted 7 1/8 (56.8cm)',
      'Fitted 7 1/4 (57.7cm)',
      'Fitted 7 3/8 (58.7cm)',
      'Fitted 7 1/2 (59.6cm)',
    ],
    measurementPlaceholder: 'Crown / Brim note',
  },
  bags: {
    label: 'Bags, Backpacks & Totes (Dimensions)',
    description: 'Bag styles paired with physical dimensions or liter capacity',
    sizes: ['Mini / Crossbody', 'Small', 'Medium', 'Large', 'Tote', 'Backpack (20L-30L)', 'Duffel (40L+)'],
    measurementPlaceholder: 'H x W x D (e.g. 42 x 30 x 15 cm)',
  },
  socks: {
    label: 'Socks (Grouped Sizes)',
    description: 'Range sizing for crew, ankle, and sport socks',
    sizes: ['EU 35-38', 'EU 39-42', 'EU 43-46', 'One Size (38-45)'],
    measurementPlaceholder: 'Cut (e.g. Crew / Ankle)',
  },
  one_size: {
    label: 'Universal / One Size',
    description: 'Single-size accessories',
    sizes: ['One Size'],
    measurementPlaceholder: 'Dimensions / Spec',
  },
}

export const PRODUCT_COLORS = [
  { name: 'Black', hex: '#18181b' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Grey', hex: '#71717a' },
  { name: 'Beige / Cream', hex: '#e7e5e4' },
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Olive Green', hex: '#3f6212' },
  { name: 'Forest Green', hex: '#14532d' },
  { name: 'Red / Crimson', hex: '#dc2626' },
  { name: 'Burgundy', hex: '#7f1d1d' },
  { name: 'Brown / Tan', hex: '#78350f' },
  { name: 'Yellow / Gold', hex: '#eab308' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Purple', hex: '#7e22ce' },
  { name: 'Multi-Color', hex: 'linear-gradient(135deg, #f97316, #3b82f6, #10b981)' },
] as const

export function calculateProductFinancials(
  buyPrice: number,
  sellPrice: number,
  offerPrice: number | null | undefined,
  stockCount: number
) {
  const cost = Math.max(0, Number(buyPrice) || 0)
  const regular = Math.max(0, Number(sellPrice) || 0)
  const offer = offerPrice && Number(offerPrice) > 0 ? Number(offerPrice) : null

  const effectivePrice = offer !== null && offer < regular ? offer : regular
  const discountPercent =
    offer !== null && regular > 0 && offer < regular
      ? Math.round(((regular - offer) / regular) * 100)
      : 0

  const unitProfit = effectivePrice - cost
  const profitMargin = effectivePrice > 0 ? Math.round((unitProfit / effectivePrice) * 100) : 0
  const qty = Math.max(0, Number(stockCount) || 0)

  const projectedRevenue = effectivePrice * qty
  const projectedProfit = unitProfit * qty
  const totalInventoryCost = cost * qty

  return {
    cost,
    regular,
    offer,
    effectivePrice,
    discountPercent,
    unitProfit,
    profitMargin,
    projectedRevenue,
    projectedProfit,
    totalInventoryCost,
  }
}
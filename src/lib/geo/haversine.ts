// --- CONFIG: SINGLE SHOP LOCATION ---
export const SHOP_LOCATION = {
  lat: -1.3554,
  lng: 36.6562,
  name: 'Luminous Drip Shop',
} as const

export interface Coordinates {
  lat: number
  lng: number
}

// --- STRICT INTERFACES ---
export type VariantCartItem = {
  variantId: string
  quantity: number
}

export interface ProductRelation {
  title: string
  base_price: number
  sale_price: number | null
  cost_price: number | null // Required for profit analytics
}

export interface StoreDeliveryConfig {
  origin_address?: string
  origin_lat: number
  origin_lng: number
  base_delivery_fee?: number
  delivery_fee_per_km?: number
  min_delivery_fee?: number
  max_delivery_fee?: number
  free_delivery_threshold: number | null
}

export interface DeliveryTierInfo {
  id: 'tier_free' | 'tier_150' | 'tier_200' | 'tier_300' | 'tier_1000'
  label: string
  rangeLabel: string
  feeKes: number
  feeCents: number
}

export const DELIVERY_TIERS: readonly DeliveryTierInfo[] = [
  {
    id: 'tier_free',
    label: 'Local Zone (0 – 10 km)',
    rangeLabel: '0 – 10 km',
    feeKes: 0,
    feeCents: 0,
  },
  {
    id: 'tier_150',
    label: 'Zone 2 (10 – 20 km)',
    rangeLabel: '10 – 20 km',
    feeKes: 150,
    feeCents: 15000,
  },
  {
    id: 'tier_200',
    label: 'Zone 3 (20 – 35 km)',
    rangeLabel: '20 – 35 km',
    feeKes: 200,
    feeCents: 20000,
  },
  {
    id: 'tier_300',
    label: 'Zone 4 (35 – 60 km)',
    rangeLabel: '35 – 60 km',
    feeKes: 300,
    feeCents: 30000,
  },
  {
    id: 'tier_1000',
    label: 'Zone 5 (60+ km)',
    rangeLabel: '60+ km',
    feeKes: 1000,
    feeCents: 100000,
  },
] as const

const EARTH_RADIUS_KM = 6371.0

// --- HELPER: Haversine Distance Calculation ---
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const nLat1 = Number(lat1)
  const nLon1 = Number(lon1)
  const nLat2 = Number(lat2)
  const nLon2 = Number(lon2)

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLon1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLon2)
  ) {
    throw new Error('Invalid GPS coordinates provided.')
  }

  const dLat = (nLat2 - nLat1) * (Math.PI / 180)
  const dLon = (nLon2 - nLon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * (Math.PI / 180)) *
      Math.cos(nLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const rawKm = EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  return Math.round(rawKm * 100) / 100
}

export function calculateHaversineDistanceKm(
  pointA: Coordinates,
  pointB: Coordinates
): number {
  return calculateDistanceKm(pointA.lat, pointA.lng, pointB.lat, pointB.lng)
}

/**
 * Tiered Delivery Fee in KES (calculated from the shop at -1.3554, 36.6562)
 * <= 10 km:  0 KES (Free)
 * <= 20 km:  150 KES (15,000 cents)
 * <= 35 km:  200 KES (20,000 cents)
 * <= 60 km:  300 KES (30,000 cents)
 * > 60 km:   1,000 KES (100,000 cents)
 */
export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 10) return 0
  if (distanceKm <= 20) return 150
  if (distanceKm <= 35) return 200
  if (distanceKm <= 60) return 300
  return 1000
}

/**
 * Tiered Delivery Fee in Cents (100 cents = 1 KES)
 */
export function calculateDeliveryFeeCents(distanceKm: number): number {
  if (distanceKm <= 10) return 0
  if (distanceKm <= 20) return 15000 // 150 KES
  if (distanceKm <= 35) return 20000 // 200 KES
  if (distanceKm <= 60) return 30000 // 300 KES
  return 100000 // 1000 KES
}

export function resolveDeliveryTier(distanceKm: number): DeliveryTierInfo {
  if (distanceKm <= 10) return DELIVERY_TIERS[0]
  if (distanceKm <= 20) return DELIVERY_TIERS[1]
  if (distanceKm <= 35) return DELIVERY_TIERS[2]
  if (distanceKm <= 60) return DELIVERY_TIERS[3]
  return DELIVERY_TIERS[4]
}

export function calculateDeliveryQuote(
  customerCoords: Coordinates,
  subtotalKes: number,
  config?: Partial<StoreDeliveryConfig>,
  deliveryMethod: 'delivery' | 'pickup' = 'delivery'
) {
  if (deliveryMethod === 'pickup') {
    return {
      distanceKm: 0,
      deliveryFeeKes: 0,
      deliveryFeeCents: 0,
      isFreeDelivery: true,
      tier: DELIVERY_TIERS[0],
    }
  }

  // Always calculate distance from the shop coordinates (-1.3554, 36.6562)
  const distanceKm = calculateDistanceKm(
    SHOP_LOCATION.lat,
    SHOP_LOCATION.lng,
    customerCoords.lat,
    customerCoords.lng
  )

  const tier = resolveDeliveryTier(distanceKm)
  const freeThreshold =
    config?.free_delivery_threshold !== undefined &&
    config?.free_delivery_threshold !== null
      ? Number(config.free_delivery_threshold)
      : 15000

  if (freeThreshold > 0 && subtotalKes >= freeThreshold) {
    return {
      distanceKm,
      deliveryFeeKes: 0,
      deliveryFeeCents: 0,
      isFreeDelivery: true,
      tier,
    }
  }

  const deliveryFeeKes = calculateDeliveryFee(distanceKm)
  const deliveryFeeCents = calculateDeliveryFeeCents(distanceKm)

  return {
    distanceKm,
    deliveryFeeKes,
    deliveryFeeCents,
    isFreeDelivery: deliveryFeeKes === 0,
    tier,
  }
}
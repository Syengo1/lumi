export interface Coordinates {
  lat: number
  lng: number
}

export interface StoreDeliveryConfig {
  origin_lat: number
  origin_lng: number
  base_delivery_fee: number
  delivery_fee_per_km: number
  min_delivery_fee: number
  max_delivery_fee: number
  free_delivery_threshold: number | null
}

const EARTH_RADIUS_KM = 6371.0

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function calculateHaversineDistanceKm(
  pointA: Coordinates,
  pointB: Coordinates
): number {
  const lat1 = Number(pointA.lat)
  const lng1 = Number(pointA.lng)
  const lat2 = Number(pointB.lat)
  const lng2 = Number(pointB.lng)

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    throw new Error('Invalid GPS coordinates provided.')
  }

  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = EARTH_RADIUS_KM * c

  return Math.round(distance * 100) / 100
}

export function calculateDeliveryQuote(
  customerCoords: Coordinates,
  subtotalKes: number,
  config: StoreDeliveryConfig,
  deliveryMethod: 'delivery' | 'pickup' = 'delivery'
) {
  if (deliveryMethod === 'pickup') {
    return {
      distanceKm: 0,
      deliveryFeeKes: 0,
      isFreeDelivery: true,
    }
  }

  const distanceKm = calculateHaversineDistanceKm(
    { lat: config.origin_lat, lng: config.origin_lng },
    customerCoords
  )

  if (
    config.free_delivery_threshold &&
    config.free_delivery_threshold > 0 &&
    subtotalKes >= config.free_delivery_threshold
  ) {
    return {
      distanceKm,
      deliveryFeeKes: 0,
      isFreeDelivery: true,
    }
  }

  const rawFee = config.base_delivery_fee + distanceKm * config.delivery_fee_per_km
  const clampedFee = Math.min(
    config.max_delivery_fee,
    Math.max(config.min_delivery_fee, rawFee)
  )

  // Round to nearest 10 KES for clean M-Pesa billing
  const deliveryFeeKes = Math.ceil(clampedFee / 10) * 10

  return {
    distanceKm,
    deliveryFeeKes,
    isFreeDelivery: false,
  }
}
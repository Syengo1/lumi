export type PaymentStatus = 'pending' | 'paid' | 'failed'
export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled'
export type DeliveryMethod = 'delivery' | 'pickup'

export interface OrderItemRecord {
  id: string
  store_id: string
  order_id: string
  product_id: string | null
  title: string
  sku: string | null
  selected_size: string
  primary_color: string | null
  quantity: number
  unit_buy_price?: number
  unit_price: number
  line_total: number
  image_url: string | null
  created_at: string
}

export interface OrderRecord {
  id: string
  store_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  delivery_method: DeliveryMethod
  delivery_address: string
  delivery_apartment: string | null
  delivery_notes: string | null
  delivery_lat: number
  delivery_lng: number
  distance_km: number
  subtotal: number
  delivery_fee: number
  total_amount: number
  payment_method: string
  payment_status: PaymentStatus
  order_status: OrderStatus
  mpesa_checkout_request_id: string | null
  mpesa_merchant_request_id: string | null
  mpesa_receipt_number: string | null
  mpesa_result_desc: string | null
  paid_at: string | null
  dispatched_at?: string | null
  delivered_at?: string | null
  created_at: string
  items: OrderItemRecord[]
}

export interface StoreOriginInfo {
  name: string
  origin_address: string
  origin_lat: number
  origin_lng: number
}

export function calculateOrderProfit(
  order: OrderRecord,
  productCostMap: Record<string, number>
) {
  let totalCost = 0
  for (const item of order.items) {
    const recordedBuyPrice = Number(item.unit_buy_price) || 0
    const fallbackBuyPrice = item.product_id ? Number(productCostMap[item.product_id] || 0) : 0
    const unitCost = recordedBuyPrice > 0 ? recordedBuyPrice : fallbackBuyPrice
    totalCost += unitCost * Number(item.quantity || 1)
  }

  const netProductRevenue = Number(order.subtotal) || 0
  const netProfit = netProductRevenue - totalCost
  const marginPercent =
    netProductRevenue > 0 ? Math.round((netProfit / netProductRevenue) * 100) : 0

  return {
    totalCost,
    netProductRevenue,
    netProfit,
    marginPercent,
  }
}

export function computeOrdersPortfolioAnalytics(
  orders: OrderRecord[],
  productCostMap: Record<string, number>
) {
  const paidOrders = orders.filter((o) => o.payment_status === 'paid' && o.order_status !== 'cancelled')
  const pendingPaymentOrders = orders.filter((o) => o.payment_status === 'pending')

  let realizedGrossRevenue = 0
  let realizedDeliveryFees = 0
  let realizedNetProfit = 0
  let totalPaidDistanceKm = 0
  let deliveryOrdersCount = 0

  for (const order of paidOrders) {
    realizedGrossRevenue += Number(order.total_amount) || 0
    realizedDeliveryFees += Number(order.delivery_fee) || 0
    const profitInfo = calculateOrderProfit(order, productCostMap)
    realizedNetProfit += profitInfo.netProfit

    if (order.delivery_method === 'delivery') {
      totalPaidDistanceKm += Number(order.distance_km) || 0
      deliveryOrdersCount += 1
    }
  }

  const pendingRevenuePipeline = pendingPaymentOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0
  )

  const averageOrderValue =
    paidOrders.length > 0 ? Math.round(realizedGrossRevenue / paidOrders.length) : 0

  const avgDeliveryDistanceKm =
    deliveryOrdersCount > 0
      ? Math.round((totalPaidDistanceKm / deliveryOrdersCount) * 10) / 10
      : 0

  const conversionRate =
    orders.length > 0 ? Math.round((paidOrders.length / orders.length) * 100) : 0

  const statusCounts: Record<OrderStatus, number> = {
    pending: 0,
    confirmed: 0,
    dispatched: 0,
    delivered: 0,
    cancelled: 0,
  }

  for (const order of orders) {
    if (statusCounts[order.order_status] !== undefined) {
      statusCounts[order.order_status] += 1
    }
  }

  return {
    totalOrders: orders.length,
    paidOrdersCount: paidOrders.length,
    pendingPaymentCount: pendingPaymentOrders.length,
    realizedGrossRevenue,
    realizedDeliveryFees,
    realizedNetProfit,
    pendingRevenuePipeline,
    averageOrderValue,
    avgDeliveryDistanceKm,
    conversionRate,
    statusCounts,
  }
}
import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { OrdersClientView } from '@/components/orders/orders-client-view'
import type { OrderItemRecord, OrderRecord, StoreOriginInfo } from '@/lib/orders/types'
import { connection } from 'next/server'

export const instant = false

export default async function AdminOrdersPage() {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const [
    { data: ordersData },
    { data: orderItemsData },
    { data: productsData },
    { data: storeData },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_items')
      .select('*')
      .eq('store_id', storeId),
    supabase
      .from('products')
      .select('id, buy_price')
      .eq('store_id', storeId),
    supabase
      .from('stores')
      .select('name, origin_address, origin_lat, origin_lng')
      .eq('id', storeId)
      .maybeSingle(),
  ])

  // Group order_items by order_id
  const itemsByOrderId = new Map<string, OrderItemRecord[]>()
  for (const item of (orderItemsData as OrderItemRecord[]) || []) {
    const existing = itemsByOrderId.get(item.order_id) || []
    existing.push(item)
    itemsByOrderId.set(item.order_id, existing)
  }

  // Merge orders with their line items
  const enrichedOrders: OrderRecord[] = ((ordersData as Omit<OrderRecord, 'items'>[]) || []).map(
    (order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) || [],
    })
  )

  // Map product_id -> buy_price for live net profit calculations
  const productCostMap: Record<string, number> = {}
  for (const prod of productsData || []) {
    productCostMap[prod.id] = Number(prod.buy_price) || 0
  }

  const storeOrigin: StoreOriginInfo = {
    name: storeData?.name || 'Luminous Drip Line',
    origin_address: storeData?.origin_address || 'Nairobi CBD, Kenya',
    origin_lat: Number(storeData?.origin_lat ?? -1.286389),
    origin_lng: Number(storeData?.origin_lng ?? 36.817223),
  }

  return (
    <OrdersClientView
      orders={enrichedOrders}
      storeOrigin={storeOrigin}
      productCostMap={productCostMap}
    />
  )
}
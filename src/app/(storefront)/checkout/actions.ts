'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { calculateDeliveryQuote } from '@/lib/geo/haversine'
import { initiateDarajaStkPush, normalizeKenyanPhone } from '@/lib/daraja/mpesa'
import { checkRateLimit, markStkPushInitiated } from '@/lib/rate-limit'
import type { ProductVariant } from '@/lib/inventory/constants'

export interface CheckoutItemInput {
  productId: string
  selectedSize: string
  quantity: number
}

export interface SubmitCheckoutInput {
  customerName: string
  customerPhone: string
  customerEmail?: string
  deliveryMethod: 'delivery' | 'pickup'
  deliveryAddress: string
  deliveryApartment?: string
  deliveryNotes?: string
  deliveryLat: number
  deliveryLng: number
  items: CheckoutItemInput[]
}

export async function getPublicStoreDeliveryConfig() {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select(
      'name, origin_address, origin_lat, origin_lng, base_delivery_fee, delivery_fee_per_km, min_delivery_fee, max_delivery_fee, free_delivery_threshold'
    )
    .eq('id', storeId)
    .maybeSingle()

  return {
    origin_address: store?.origin_address || 'Nairobi CBD, Kenya',
    origin_lat: Number(store?.origin_lat ?? -1.286389),
    origin_lng: Number(store?.origin_lng ?? 36.817223),
    base_delivery_fee: Number(store?.base_delivery_fee ?? 150),
    delivery_fee_per_km: Number(store?.delivery_fee_per_km ?? 35),
    min_delivery_fee: Number(store?.min_delivery_fee ?? 200),
    max_delivery_fee: Number(store?.max_delivery_fee ?? 1500),
    free_delivery_threshold:
      store?.free_delivery_threshold !== null && store?.free_delivery_threshold !== undefined
        ? Number(store.free_delivery_threshold)
        : 15000,
  }
}

export async function processOrderAndInitiateMpesa(input: SubmitCheckoutInput) {
  if (!input.items || input.items.length === 0) {
    return { error: 'Your cart is empty.' }
  }

  let normalizedPhone: string
  try {
    normalizedPhone = normalizeKenyanPhone(input.customerPhone)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid phone number.' }
  }

  // Rate limit STK pushes per phone number to prevent Safaricom USSD session collision
  const rateCheck = checkRateLimit(`stk_phone_${normalizedPhone}`, {
    maxRequests: 4,
    windowMs: 5 * 60 * 1000,
    minIntervalMs: 35 * 1000,
  })

  if (!rateCheck.allowed) {
    return {
      error: `An M-Pesa prompt was just sent to +${normalizedPhone}. Please wait ${rateCheck.retryAfterSeconds}s before starting a new STK push.`,
    }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  // 1. Fetch authoritative store delivery settings & origin coordinates
  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single()

  if (!store) {
    return { error: 'Store configuration not found.' }
  }

  // 2. Fetch authoritative product prices & stock from Supabase
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)))
  const { data: dbProducts, error: prodError } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .in('id', productIds)

  if (prodError || !dbProducts || dbProducts.length === 0) {
    return { error: 'Unable to verify catalog items.' }
  }

  // 3. Validate stock and compute authoritative subtotal
  let serverSubtotal = 0
  const verifiedOrderItems: Array<{
    store_id: string
    product_id: string
    title: string
    sku: string | null
    selected_size: string
    primary_color: string
    quantity: number
    unit_buy_price: number
    unit_price: number
    line_total: number
    image_url: string | null
  }> = []

  for (const cartItem of input.items) {
    const product = dbProducts.find((p) => p.id === cartItem.productId)
    if (!product) {
      return { error: 'One or more items in your bag are no longer available.' }
    }

    const qty = Math.max(1, Math.floor(cartItem.quantity))
    const variants: ProductVariant[] = Array.isArray(product.variants) ? product.variants : []
    const matchedVariant = variants.find((v) => v.size === cartItem.selectedSize)

    if (matchedVariant && matchedVariant.stock < qty) {
      return {
        error: `Only ${matchedVariant.stock} left for "${product.title}" in size ${cartItem.selectedSize}.`,
      }
    }

    if ((product.stock_count ?? 0) < qty) {
      return { error: `Insufficient stock for "${product.title}".` }
    }

    const regular = Number(product.price) || 0
    const offer =
      product.offer_price &&
      Number(product.offer_price) > 0 &&
      Number(product.offer_price) < regular
        ? Number(product.offer_price)
        : null
    const unitPrice = offer ?? regular
    const lineTotal = unitPrice * qty

    serverSubtotal += lineTotal

    verifiedOrderItems.push({
      store_id: storeId,
      product_id: product.id,
      title: product.title,
      sku: product.sku || null,
      selected_size: cartItem.selectedSize || 'Standard',
      primary_color: product.primary_color || 'Black',
      quantity: qty,
      unit_buy_price: Number(product.buy_price) || 0,
      unit_price: unitPrice,
      line_total: lineTotal,
      image_url: product.image_urls?.[0] || null,
    })
  }

  // 4. Server-Side Haversine Distance & Delivery Fee Calculation
  const deliveryQuote = calculateDeliveryQuote(
    { lat: input.deliveryLat, lng: input.deliveryLng },
    serverSubtotal,
    {
      origin_lat: Number(store.origin_lat ?? -1.286389),
      origin_lng: Number(store.origin_lng ?? 36.817223),
      base_delivery_fee: Number(store.base_delivery_fee ?? 150),
      delivery_fee_per_km: Number(store.delivery_fee_per_km ?? 35),
      min_delivery_fee: Number(store.min_delivery_fee ?? 200),
      max_delivery_fee: Number(store.max_delivery_fee ?? 1500),
      free_delivery_threshold: store.free_delivery_threshold
        ? Number(store.free_delivery_threshold)
        : null,
    },
    input.deliveryMethod
  )

  const serverTotalAmount = serverSubtotal + deliveryQuote.deliveryFeeKes
  const orderNumber = `LDL${Date.now().toString().slice(-6)}${Math.random()
    .toString(36)
    .substring(2, 4)
    .toUpperCase()}`

  const expiresAtIso = new Date(Date.now() + 120 * 1000).toISOString()

  // 5. Insert Order into Supabase
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      order_number: orderNumber,
      customer_name: input.customerName.trim(),
      customer_phone: normalizedPhone,
      customer_email: input.customerEmail?.trim() || null,
      delivery_method: input.deliveryMethod,
      delivery_address: input.deliveryAddress.trim(),
      delivery_apartment: input.deliveryApartment?.trim() || null,
      delivery_notes: input.deliveryNotes?.trim() || null,
      delivery_lat: input.deliveryLat,
      delivery_lng: input.deliveryLng,
      distance_km: deliveryQuote.distanceKm,
      subtotal: serverSubtotal,
      delivery_fee: deliveryQuote.deliveryFeeKes,
      total_amount: serverTotalAmount,
      payment_method: 'mpesa',
      payment_status: 'pending',
      order_status: 'pending',
      payment_expires_at: expiresAtIso,
    })
    .select('id, order_number')
    .single()

  if (orderError || !createdOrder) {
    return { error: `Order creation failed: ${orderError?.message || 'Unknown error'}` }
  }

  // 6. Insert Order Items
  const itemsWithOrderId = verifiedOrderItems.map((item) => ({
    ...item,
    order_id: createdOrder.id,
  }))

  const { error: itemsError } = await supabase.from('order_items').insert(itemsWithOrderId)
  if (itemsError) {
    return { error: `Failed to save order items: ${itemsError.message}` }
  }

  // 7. Trigger Safaricom M-Pesa Daraja STK Push & Persist via SECURITY DEFINER RPC
  try {
    markStkPushInitiated(createdOrder.id)

    const stkResponse = await initiateDarajaStkPush({
      phone: normalizedPhone,
      amount: serverTotalAmount,
      orderNumber: createdOrder.order_number,
      description: `${store.name} Order`,
    })

    await supabase.rpc('attach_order_stk_request', {
      target_order_id: createdOrder.id,
      target_store_id: storeId,
      checkout_req_id: stkResponse.CheckoutRequestID,
      merchant_req_id: stkResponse.MerchantRequestID,
      result_desc: stkResponse.CustomerMessage,
      updated_phone: normalizedPhone,
    })

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      customerMessage: stkResponse.CustomerMessage,
    }
  } catch (stkErr) {
    const errMsg =
      stkErr instanceof Error
        ? stkErr.message
        : 'Order saved, but STK push could not be sent automatically.'

    await supabase.rpc('attach_order_stk_request', {
      target_order_id: createdOrder.id,
      target_store_id: storeId,
      checkout_req_id: null,
      merchant_req_id: null,
      result_desc: `STK Error: ${errMsg}`,
      updated_phone: normalizedPhone,
    })

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      stkWarning: errMsg,
    }
  }
}
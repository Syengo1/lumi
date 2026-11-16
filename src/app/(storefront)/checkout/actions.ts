'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import {
  SHOP_LOCATION,
  calculateDeliveryQuote,
  type ProductRelation,
} from '@/lib/geo/haversine'
import { initiateDarajaStkPush, normalizeKenyanPhone } from '@/lib/daraja/mpesa'
import {
  canProceedRateLimit,
  commitRateLimit,
  markStkPushInitiated,
} from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import type { ProductVariant } from '@/lib/inventory/constants'

export interface CheckoutItemInput {
  productId: string
  selectedSize: string
  quantity: number
  variantId?: string
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export async function getPublicStoreDeliveryConfig() {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select('free_delivery_threshold')
    .eq('id', storeId)
    .maybeSingle()

  return {
    origin_address: SHOP_LOCATION.name,
    origin_lat: Number(SHOP_LOCATION.lat),
    origin_lng: Number(SHOP_LOCATION.lng),
    base_delivery_fee: 150,
    delivery_fee_per_km: 35,
    min_delivery_fee: 150,
    max_delivery_fee: 1000,
    free_delivery_threshold:
      store?.free_delivery_threshold !== null &&
      store?.free_delivery_threshold !== undefined
        ? Number(store.free_delivery_threshold)
        : 15000,
  }
}

export async function processOrderAndInitiateMpesa(input: SubmitCheckoutInput) {
  // 1. Validate customer & cart inputs upfront
  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    return { error: 'Your cart is empty.' }
  }

  const customerName = input.customerName?.trim() || ''
  if (customerName.length < 2) {
    return { error: 'Please enter your full name.' }
  }

  const deliveryMethod: 'delivery' | 'pickup' =
    input.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'
  const deliveryAddress =
    deliveryMethod === 'pickup'
      ? input.deliveryAddress?.trim() || 'Shop Pickup'
      : input.deliveryAddress?.trim() || ''

  if (deliveryMethod === 'delivery' && deliveryAddress.length < 3) {
    return {
      error: 'Please search or enter a valid delivery street, estate, or landmark.',
    }
  }

  let normalizedPhone: string
  try {
    normalizedPhone = normalizeKenyanPhone(input.customerPhone || '')
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Invalid M-Pesa phone number.',
    }
  }

  // 2. Consolidate duplicate (productId + selectedSize) lines and validate UUIDs
  const consolidatedItemsMap = new Map<string, CheckoutItemInput>()
  for (const rawItem of input.items) {
    const productId = rawItem.productId?.trim()
    if (!productId || !UUID_REGEX.test(productId)) {
      return { error: 'Invalid product identifier in cart.' }
    }
    const selectedSize = (rawItem.selectedSize || 'Standard').trim() || 'Standard'
    const qty = Math.max(1, Math.floor(Number(rawItem.quantity) || 1))
    const key = `${productId}__${selectedSize}`

    const existing = consolidatedItemsMap.get(key)
    if (existing) {
      existing.quantity += qty
    } else {
      consolidatedItemsMap.set(key, {
        productId,
        selectedSize,
        quantity: qty,
        variantId: key,
      })
    }
  }
  const consolidatedItems = Array.from(consolidatedItemsMap.values())

  // 3. Phase 1 Rate-Limit Check: Verify phone is not on STK cooldown
  const rateCheck = canProceedRateLimit(`stk_phone_${normalizedPhone}`, {
    maxRequests: 4,
    windowMs: 5 * 60 * 1000,
    minIntervalMs: 20 * 1000,
  })
  if (!rateCheck.allowed) {
    return {
      error: `An M-Pesa prompt was recently sent to +${normalizedPhone}. Please wait ${rateCheck.retryAfterSeconds}s before starting a new STK push.`,
    }
  }

  const supabase = await createClient()
  const storeId = getStoreId()
  const storeConfig = await getPublicStoreDeliveryConfig()

  // 4. Fetch authoritative product prices, cost_price (buy_price), & stock from Supabase
  const productIds = Array.from(new Set(consolidatedItems.map((i) => i.productId)))
  const { data: dbProducts, error: prodError } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .in('id', productIds)

  if (prodError || !dbProducts || dbProducts.length === 0) {
    return { error: 'Unable to verify catalog items.' }
  }

  // 5. Validate cumulative product stock, per-size variant stock, and compute authoritative subtotal
  const cumulativeProductQty = new Map<string, number>()
  for (const item of consolidatedItems) {
    cumulativeProductQty.set(
      item.productId,
      (cumulativeProductQty.get(item.productId) || 0) + item.quantity
    )
  }

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

  for (const cartItem of consolidatedItems) {
    const product = dbProducts.find((p) => p.id === cartItem.productId)
    if (!product) {
      return { error: 'One or more items in your bag are no longer available.' }
    }

    const totalProductQtyRequested =
      cumulativeProductQty.get(product.id) || cartItem.quantity
    if ((product.stock_count ?? 0) < totalProductQtyRequested) {
      return {
        error: `Insufficient total stock for "${product.title}" (requested ${totalProductQtyRequested}, available ${product.stock_count ?? 0}).`,
      }
    }

    const qty = cartItem.quantity
    const variants: ProductVariant[] = Array.isArray(product.variants)
      ? product.variants
      : []

    if (variants.length > 0) {
      const matchedVariant = variants.find((v) => v.size === cartItem.selectedSize)
      if (!matchedVariant) {
        return {
          error: `Size "${cartItem.selectedSize}" is not valid for "${product.title}".`,
        }
      }
      if (Number(matchedVariant.stock) < qty) {
        return {
          error: `Only ${matchedVariant.stock} left for "${product.title}" in size ${cartItem.selectedSize}.`,
        }
      }
    }

    const relation: ProductRelation = {
      title: product.title,
      base_price: Math.max(0, Number(product.price) || 0),
      sale_price:
        product.offer_price &&
        Number(product.offer_price) > 0 &&
        Number(product.offer_price) < Number(product.price)
          ? Number(product.offer_price)
          : null,
      cost_price: Math.max(0, Number(product.buy_price) || 0),
    }

    const unitPrice = relation.sale_price ?? relation.base_price
    const lineTotal = unitPrice * qty
    serverSubtotal += lineTotal

    verifiedOrderItems.push({
      store_id: storeId,
      product_id: product.id,
      title: relation.title,
      sku: product.sku || null,
      selected_size: cartItem.selectedSize,
      primary_color: product.primary_color || 'Black',
      quantity: qty,
      unit_buy_price: relation.cost_price ?? 0,
      unit_price: unitPrice,
      line_total: lineTotal,
      image_url: product.image_urls?.[0] || null,
    })
  }

  // 6. Server-Side Haversine Distance & Tiered Delivery Fee from Shop (-1.3554, 36.6562)
  const customerLat =
    deliveryMethod === 'pickup'
      ? Number(SHOP_LOCATION.lat)
      : Number(input.deliveryLat)
  const customerLng =
    deliveryMethod === 'pickup'
      ? Number(SHOP_LOCATION.lng)
      : Number(input.deliveryLng)

  if (!isValidCoordinate(customerLat, customerLng)) {
    return {
      error: 'Invalid delivery GPS coordinates. Please search or pin your location on the map.',
    }
  }

  let deliveryQuote: ReturnType<typeof calculateDeliveryQuote>
  try {
    deliveryQuote = calculateDeliveryQuote(
      { lat: customerLat, lng: customerLng },
      serverSubtotal,
      storeConfig,
      deliveryMethod
    )
  } catch (geoErr) {
    return {
      error:
        geoErr instanceof Error
          ? geoErr.message
          : 'Failed to calculate delivery distance from shop.',
    }
  }

  const serverTotalAmount = Math.max(
    1,
    Math.round(serverSubtotal + deliveryQuote.deliveryFeeKes)
  )
  const orderNumber = `LDL${Date.now().toString().slice(-6)}${Math.random()
    .toString(36)
    .substring(2, 4)
    .toUpperCase()}`
  const expiresAtIso = new Date(Date.now() + 120 * 1000).toISOString()

  // 7. Insert Order into Supabase
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: normalizedPhone,
      customer_email: input.customerEmail?.trim() || null,
      delivery_method: deliveryMethod,
      delivery_address: deliveryAddress,
      delivery_apartment: input.deliveryApartment?.trim() || null,
      delivery_notes: input.deliveryNotes?.trim() || null,
      delivery_lat: customerLat,
      delivery_lng: customerLng,
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
    return {
      error: `Order creation failed: ${orderError?.message || 'Unknown database error'}`,
    }
  }

  // 8. Insert Order Items
  const itemsWithOrderId = verifiedOrderItems.map((item) => ({
    ...item,
    order_id: createdOrder.id,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(itemsWithOrderId)

  if (itemsError) {
    await supabase.rpc('customer_cancel_pending_order', {
      target_order_id: createdOrder.id,
      target_store_id: storeId,
    })
    return { error: `Failed to save order items: ${itemsError.message}` }
  }

  // 9. Trigger Safaricom M-Pesa Daraja STK Push & persist CheckoutRequestID
  try {
    const stkResponse = await initiateDarajaStkPush({
      phone: normalizedPhone,
      amount: serverTotalAmount,
      orderNumber: createdOrder.order_number,
      description: 'LuminousDrip',
    })

    commitRateLimit(`stk_phone_${normalizedPhone}`, 5 * 60 * 1000)
    markStkPushInitiated(createdOrder.id)

    const { data: attachedOk, error: attachError } = await supabase.rpc(
      'attach_order_stk_request',
      {
        target_order_id: createdOrder.id,
        target_store_id: storeId,
        checkout_req_id: stkResponse.CheckoutRequestID,
        merchant_req_id: stkResponse.MerchantRequestID,
        result_desc: stkResponse.CustomerMessage,
        updated_phone: normalizedPhone,
      }
    )

    if (attachError || attachedOk === false) {
      console.error(
        `[Checkout RPC Persistence Error] Order #${createdOrder.order_number}:`,
        attachError?.message || 'attach_order_stk_request returned false'
      )
      return {
        success: true,
        orderId: createdOrder.id,
        orderNumber: createdOrder.order_number,
        stkWarning:
          'M-Pesa request was accepted by Safaricom, but linking the CheckoutRequestID encountered a database warning.',
      }
    }

    revalidatePath('/orders')
    revalidatePath(`/orders/${createdOrder.id}`)

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      checkoutRequestId: stkResponse.CheckoutRequestID,
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

    revalidatePath('/orders')
    revalidatePath(`/orders/${createdOrder.id}`)

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      stkWarning: errMsg,
    }
  }
}
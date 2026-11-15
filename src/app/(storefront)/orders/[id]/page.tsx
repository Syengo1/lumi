import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OrderPaymentTracker } from '@/components/store/order-payment-tracker'
import { MapPin, Smartphone, ShoppingBag } from 'lucide-react'
import { connection } from 'next/server'

export const instant = false

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()

  const { id } = await params
  const supabase = await createClient()
  const storeId = getStoreId()

  const [{ data: order }, { data: orderItems }] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('store_id', storeId)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .eq('store_id', storeId),
  ])

  if (!order) {
    notFound()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 space-y-8">
      <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-3xl overflow-hidden py-0 gap-0">
        <OrderPaymentTracker
          orderId={order.id}
          orderNumber={order.order_number}
          initialPaymentStatus={order.payment_status}
          initialOrderStatus={order.order_status}
          initialPhone={order.customer_phone}
          initialCheckoutRequestId={order.mpesa_checkout_request_id}
          initialReceipt={order.mpesa_receipt_number}
          initialResultDesc={order.mpesa_result_desc}
          initialExpiresAt={
            order.payment_expires_at ||
            new Date(new Date(order.created_at).getTime() + 120 * 1000).toISOString()
          }
          totalAmount={Number(order.total_amount)}
          items={(orderItems || []).map((i) => ({
            id: i.id,
            product_id: i.product_id,
            title: i.title,
            selected_size: i.selected_size,
            primary_color: i.primary_color,
            quantity: i.quantity,
            unit_price: Number(i.unit_price),
            image_url: i.image_url,
          }))}
        />

        <CardContent className="p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-secondary/50 space-y-1">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Smartphone size={14} className="text-primary" /> Customer & M-Pesa Details
              </span>
              <p className="font-bold text-sm">{order.customer_name}</p>
              <p className="text-xs text-muted-foreground font-mono">+{order.customer_phone}</p>
              <p className="text-xs font-semibold text-primary capitalize">
                Order Stage: {order.order_status}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-secondary/50 space-y-1">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <MapPin size={14} className="text-primary" /> Delivery & Distance
              </span>
              <p className="font-bold text-sm">{order.delivery_address}</p>
              <p className="text-xs text-muted-foreground">
                Distance: {order.distance_km} km • Method: {order.delivery_method}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
              Items Ordered
            </h3>
            <div className="divide-y divide-border/50">
              {(orderItems || []).map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-bold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Size: {item.selected_size} • Color: {item.primary_color} • Qty: {item.quantity}
                    </p>
                  </div>
                  <span className="font-bold">KES {Number(item.line_total).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-secondary/40 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>KES {Number(order.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery Fee ({order.distance_km} km)</span>
              <span>KES {Number(order.delivery_fee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-extrabold pt-2 border-t border-border/60">
              <span>Total Paid / Due</span>
              <span className="text-primary">KES {Number(order.total_amount).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Link href="/shop">
              <Button className="rounded-xl font-bold gap-2">
                <ShoppingBag size={16} /> Continue Shopping
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
export interface OrderItemSummary {
  id: string
  product_id: string | null
  title: string
  selected_size: string
  primary_color: string | null
  quantity: number
  unit_price: number
  image_url: string | null
}

export interface OrderPaymentTrackerProps {
  orderId: string
  orderNumber: string
  initialPaymentStatus: 'pending' | 'paid' | 'failed'
  initialOrderStatus: string
  initialPhone: string
  initialCheckoutRequestId?: string | null
  initialReceipt: string | null
  initialResultDesc: string | null
  initialExpiresAt: string
  totalAmount: number
  items: OrderItemSummary[]
}

export interface TrackerFeedback {
  type: 'info' | 'error'
  text: string
}

export const WINDOW_SECONDS = 120
export const RESEND_COOLDOWN_SECONDS = 35
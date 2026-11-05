/*
 * pending -> confirmed -> shipped -> delivered, or cancelled before shipping.
 */
export const OrderStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]
export const OrderStatusValues = Object.values(OrderStatus)

/*
 * The statuses a shop can move an order to from each status.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  confirmed: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  shipped: [OrderStatus.DELIVERED],
  delivered: [],
  cancelled: [],
}

export const PaymentStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  /*
   * The order was cancelled before cash on delivery was collected.
   */
  VOIDED: 'voided',
} as const

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

export const PaymentProvider = {
  CASH_ON_DELIVERY: 'cod',
} as const

// The delivery fee and free-delivery threshold: shared/constants/delivery.ts.

export const MAX_QUANTITY_PER_ITEM = 10

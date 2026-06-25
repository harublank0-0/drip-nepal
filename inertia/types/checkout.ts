export type CheckoutStep = 'address' | 'delivery' | 'payment' | 'review'

export interface Address {
  id: string
  fullName: string
  phoneNumber: string
  province: string
  district: string
  city: string
  area: string
  landmark?: string
  postalCode?: string
  isDefault: boolean
  label: string
}

export interface DeliveryMethod {
  id: string
  name: string
  description: string
  price: number
  estimatedDays: string
  estimatedDate: string
  storeId?: string
}

export interface PaymentMethod {
  id: string
  name: string
  description: string
  logo?: string
  fee?: number
  feeLabel?: string
  enabled: boolean
}

export interface Coupon {
  code: string
  discountPercent: number
  description: string
}

export interface AddressFormData {
  fullName: string
  phoneNumber: string
  province: string
  district: string
  city: string
  area: string
  landmark: string
  postalCode: string
  label: string
  isDefault: boolean
  saveAddress: boolean
}

export interface OrderItem {
  id: string
  name: string
  image: string
  price: number
  quantity: number
  color: string
  size: string
  storeId: string
  storeName: string
}

export interface OrderConfirmation {
  orderNumber: string
  estimatedDelivery: string
  items: OrderItem[]
  shippingAddress: Address
  deliveryMethod: DeliveryMethod
  paymentMethod: PaymentMethod
  subtotal: number
  shipping: number
  discount: number
  tax: number
  total: number
}

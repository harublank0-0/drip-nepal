import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Order from '#models/order'
import ProductVariant from '#models/product_variant'
import User from '#models/user'
import { OrderStatus } from '#constants/order'
import { VariantStatus } from '#constants/product'
import type { CartOwner } from '#modules/orders/customer'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService, { type Buyer } from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import type { AddressPayload } from '#modules/orders/validators/checkout'

const PASSWORD = 'dripnepal'

const CUSTOMERS: { fullName: string; email: string; phone: string; address: AddressPayload }[] = [
  {
    fullName: 'Aarav Shrestha',
    email: 'aarav@dev.dripnepal.invalid',
    phone: '9800000011',
    address: {
      label: 'Home',
      recipientName: 'Aarav Shrestha',
      recipientPhone: '9800000011',
      province: 'Bagmati',
      district: 'Kathmandu',
      city: 'Kathmandu',
      area: 'Baneshwor',
      streetAddress: 'Shantinagar Marg 12',
    },
  },
  {
    fullName: 'Sita Gurung',
    email: 'sita@dev.dripnepal.invalid',
    phone: '9800000012',
    address: {
      label: 'Home',
      recipientName: 'Sita Gurung',
      recipientPhone: '9800000012',
      province: 'Gandaki',
      district: 'Kaski',
      city: 'Pokhara',
      area: 'Lakeside',
      streetAddress: 'Baidam Road 4',
    },
  },
  {
    fullName: 'Bikash Rai',
    email: 'bikash@dev.dripnepal.invalid',
    phone: '9800000013',
    address: {
      label: 'Office',
      recipientName: 'Bikash Rai',
      recipientPhone: '9800000013',
      province: 'Koshi',
      district: 'Morang',
      city: 'Biratnagar',
      area: 'Traffic Chowk',
      streetAddress: 'Main Road 21',
    },
  },
]

const GUEST_ADDRESS: AddressPayload = {
  recipientName: 'Maya Tamang',
  recipientPhone: '9800000014',
  province: 'Bagmati',
  district: 'Lalitpur',
  city: 'Lalitpur',
  area: 'Pulchowk',
  streetAddress: 'Pulchowk Road 7',
}

/*
 * The transitions that bring a new order to each status.
 */
const STEPS: Record<OrderStatus, OrderStatus[]> = {
  pending: [],
  confirmed: [OrderStatus.CONFIRMED],
  shipped: [OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
  delivered: [OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  cancelled: [OrderStatus.CANCELLED],
}

/*
 * `customer` indexes CUSTOMERS; without it the checkout is a guest's. Items
 * from different shops split into one order per shop, as in a real checkout.
 */
const CHECKOUTS: {
  customer?: number
  items: string[]
  status: OrderStatus
  daysAgo: number
  notes?: string
}[] = [
  {
    customer: 0,
    items: ['Heavyweight Oversized Hoodie', 'Dhaka Print Kurta'],
    status: OrderStatus.DELIVERED,
    daysAgo: 12,
  },
  { customer: 0, items: ['Everyday Cotton Tee'], status: OrderStatus.SHIPPED, daysAgo: 3 },
  { customer: 0, items: ['Field Watch'], status: OrderStatus.PENDING, daysAgo: 0 },
  { customer: 1, items: ['Handloom Cotton Saree'], status: OrderStatus.DELIVERED, daysAgo: 20 },
  {
    customer: 1,
    items: ['Trail Puffer Jacket', 'Canvas Tote Bag'],
    status: OrderStatus.CONFIRMED,
    daysAgo: 1,
  },
  { customer: 1, items: ['Coach Jacket'], status: OrderStatus.CANCELLED, daysAgo: 6 },
  {
    customer: 2,
    items: ['Street Runner Sneakers'],
    status: OrderStatus.PENDING,
    daysAgo: 0,
    notes: 'Please call before delivery.',
  },
  {
    customer: 2,
    items: ['Pashmina Shawl', 'Relaxed Linen Shirt'],
    status: OrderStatus.SHIPPED,
    daysAgo: 2,
  },
  { items: ['Boxy Graphic Tee'], status: OrderStatus.PENDING, daysAgo: 1 },
]

/*
 * Customers with saved addresses, orders in every status (one of them a
 * guest's) and one open cart, so the account, shop and admin order pages have
 * something to show in development. Goes through the real cart, checkout and
 * order services, so stock, totals and payments stay consistent.
 *
 * Customer logins: aarav@, sita@ and bikash@dev.dripnepal.invalid / dripnepal
 * Bikash has the open cart.
 */
export default class extends BaseSeeder {
  static environment = ['development']

  #cart = new CartService()
  #checkout = new CheckoutService(this.#cart)
  #orders = new OrderService()

  async run() {
    if (await User.findBy('email', CUSTOMERS[0].email)) return

    const users: User[] = []
    const addressIds: string[] = []
    for (const { address, ...customer } of CUSTOMERS) {
      const user = await User.create({ ...customer, password: PASSWORD })
      const saved = await this.#checkout.saveAddress(user, address)
      users.push(user)
      addressIds.push(saved.id)
    }

    let guestOrderNumber = ''
    for (const checkout of CHECKOUTS) {
      const isGuest = checkout.customer === undefined
      const user = isGuest ? null : users[checkout.customer!]
      const guestToken = randomUUID()
      const owner: CartOwner = user ? { userId: user.id } : { guestToken }
      const buyer: Buyer = user ? { user } : { guestToken }

      for (const name of checkout.items) {
        await this.#cart.add(owner, await this.#variantId(name), 1)
      }

      const { orderNumbers } = await this.#checkout.placeOrders(buyer, {
        ...(user ? { addressId: addressIds[checkout.customer!] } : { address: GUEST_ADDRESS }),
        notes: checkout.notes,
      })
      if (isGuest) guestOrderNumber = orderNumbers[0]

      const orders = await Order.query().whereIn('order_number', orderNumbers)
      for (const order of orders) {
        for (const step of STEPS[checkout.status]) {
          await this.#orders.transition(order, step)
        }
      }

      const placedAt = DateTime.now().minus({ days: checkout.daysAgo }).toSQL()
      await Order.query()
        .whereIn('order_number', orderNumbers)
        .update({ placed_at: placedAt, created_at: placedAt })
    }

    const bikash = { userId: users[2].id }
    await this.#cart.add(bikash, await this.#variantId('Ribbed Beanie'), 2)
    await this.#cart.add(bikash, await this.#variantId('Fleece Pullover'), 1)

    console.log(`Demo orders seeded. Customer logins: ${CUSTOMERS.map((c) => c.email).join(', ')}`)
    console.log(`Customer password: ${PASSWORD}`)
    console.log(`Guest order to track: ${guestOrderNumber}, phone ${GUEST_ADDRESS.recipientPhone}`)
  }

  async #variantId(productName: string) {
    const variant = await ProductVariant.query()
      .whereHas('product', (product) => product.where('name', productName))
      .where('status', VariantStatus.ACTIVE)
      .where('quantity', '>', 0)
      .orderBy('sku', 'asc')
      .firstOrFail()
    return variant.id
  }
}

import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { Session } from '@adonisjs/session'
import type User from '#models/user'

/*
 * Who a cart belongs to: a logged-in user, or a guest known only by a
 * random token kept in their session.
 */
export type CartOwner = { userId: string } | { guestToken: string }

const GUEST_CART_KEY = 'guest_cart'
const ORDER_ACCESS_KEY = 'order_access'
const MAX_REMEMBERED_ORDERS = 20

export function guestToken(session: Session | undefined): string | null {
  const token = session?.get(GUEST_CART_KEY)
  return typeof token === 'string' ? token : null
}

/*
 * The cart owner for this request. With `create`, a guest without a token
 * gets one, so their first "add to cart" has somewhere to go.
 */
export function cartOwner(
  ctx: Pick<HttpContext, 'auth' | 'session'>,
  { create = false } = {}
): CartOwner | null {
  const user = ctx.auth.user as User | undefined
  if (user) return { userId: user.id }

  let token = guestToken(ctx.session)
  if (!token && create) {
    token = randomUUID()
    ctx.session.put(GUEST_CART_KEY, token)
  }
  return token ? { guestToken: token } : null
}

export function forgetGuestCart(session: Session) {
  session.forget(GUEST_CART_KEY)
}

/*
 * Order numbers this browser may open without logging in: the guest's own
 * orders, and orders found on the tracking page with their mobile number.
 * Newest first, capped.
 */
export function rememberedOrders(session: Session | undefined): string[] {
  const value = session?.get(ORDER_ACCESS_KEY)
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

export function rememberOrders(session: Session, orderNumbers: string[]) {
  const merged = [...new Set([...orderNumbers, ...rememberedOrders(session)])]
  session.put(ORDER_ACCESS_KEY, merged.slice(0, MAX_REMEMBERED_ORDERS))
}

/*
 * The last ten digits of a phone number, so "+977 98-1234 5678" and
 * "9812345678" match.
 */
export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '').slice(-10)
}

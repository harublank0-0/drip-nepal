import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import { UserStatus } from '#constants/user_status'
import CartService from '#modules/orders/services/cart_service'
import { forgetGuestCart, guestToken } from '#modules/orders/customer'

/*
 * Accounts in these statuses, and soft-deleted accounts, cannot sign in, and
 * a signed-in session ends on its next request (RF-04). v1 has no email
 * verification, so the default `pending_verification` status may sign in.
 */
const BLOCKED_STATUSES: readonly string[] = [
  UserStatus.SUSPENDED,
  UserStatus.DEACTIVATED,
  UserStatus.DELETED,
]

export function canSignIn(user: User) {
  return user.deletedAt === null && !BLOCKED_STATUSES.includes(user.status)
}

/*
 * Logs the user in and tags the session with their id, so every session of
 * an account can be found and ended (session database store). What they
 * put in the cart as a guest moves to their account.
 */
export async function signIn({ auth, session }: HttpContext, user: User) {
  await auth.use('web').login(user)
  if (session.supportsTagging()) {
    await session.tag(String(user.id))
  }

  const token = guestToken(session)
  if (token) {
    await new CartService().adoptGuestCart(token, user)
    forgetGuestCart(session)
  }
}

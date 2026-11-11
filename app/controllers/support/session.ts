import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'

/*
 * The session helpers of docs/09 §3.4. They take `ctx`, so they live with
 * the HTTP layer; controllers and middleware share them. They implement
 * docs/07 §3.1, §3.2 and §3.11. `rotateSessionId` joins them with its first
 * caller in M1 (`verifyMfaChallenge`, `changePassword`).
 */

// The session keys of docs/07 §3.2 that belong to one sign-in.
export const SESSION_KEYS = {
  securityStamp: 'security_stamp',
  authenticatedAt: 'authenticated_at',
  mfaVerifiedAt: 'mfa_verified_at',
  sellerSeenAt: 'seller_seen_at',
  adminSeenAt: 'admin_seen_at',
} as const

/*
 * For `logIn` only, after the `identity` action has checked the credentials
 * and the account status. Nothing from an earlier sign-in survives: the
 * guard's `login()` only puts `auth_web` and regenerates the ID, which
 * carries every other key along (docs/07 §3.2). The tag comes after
 * `login()`, because the regenerated ID is a new row (docs/07 §3.1).
 */
export async function startSession(ctx: HttpContext, user: User, stamp: string) {
  for (const key of Object.values(SESSION_KEYS)) ctx.session.forget(key)
  await ctx.auth.use('web').login(user)
  const now = new Date().toISOString()
  ctx.session.put(SESSION_KEYS.securityStamp, stamp)
  ctx.session.put(SESSION_KEYS.authenticatedAt, now)
  ctx.session.put(SESSION_KEYS.sellerSeenAt, now)
  ctx.session.put(SESSION_KEYS.adminSeenAt, now)
  await ctx.session.tag(String(user.id))
}

/*
 * `logOut` and every forced logout (docs/07 §3.11): the guard forgets
 * `auth_web` but neither clears nor regenerates the session, so this does
 * both. An emptied session is deleted when the response commits it, and the
 * old cookie no longer finds a row.
 */
export async function endSession(ctx: HttpContext) {
  const user = ctx.auth.user
  await ctx.auth.use('web').logout()
  if (user) await ctx.session.untag(String(user.id))
  ctx.session.clear()
  ctx.session.regenerate()
}

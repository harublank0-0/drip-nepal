import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'

/*
 * The session helpers of docs/09 §3.4. They take `ctx`, so they live with
 * the HTTP layer; controllers and middleware share them. They implement
 * docs/07 §3.1, §3.2 and §3.11. `rotateSessionId` joined them with its
 * first caller, `changePassword` (M1 part 4), and `recordMfaVerified` with
 * `verifyMfaChallenge` (M1 part 5); the shop operations that make the
 * caller an owner or member follow.
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
 * The MFA proof of docs/07 §3.2, after `verifyMfaChallenge` (and the
 * development-only sign-in, 07 §3.13): `mfa_verified_at` as
 * `{ user_id, at }`, which the admin surface and the step-up accept only for
 * this user and only when `at` is not earlier than `authenticated_at`; and
 * `admin_seen_at`, so a challenge ends admin idle (07 §3.4). It never
 * touches `authenticated_at`, so the 7-day staff limit still ends in a
 * password sign-in. The caller rotates the session ID afterwards where 07
 * §3.9 says so.
 */
export function recordMfaVerified(ctx: HttpContext, userId: string, at = new Date()) {
  const time = at.toISOString()
  ctx.session.put(SESSION_KEYS.mfaVerifiedAt, { user_id: userId, at: time })
  ctx.session.put(SESSION_KEYS.adminSeenAt, time)
}

/*
 * A new session ID for the signed-in session, which keeps its values
 * (docs/07 §3.1): after `changePassword`, whose controller first puts the
 * new stamp, and later after `verifyMfaChallenge` and a privilege the user
 * gains in their own request. The store's commit writes the new ID with its
 * data and expiry only, so the new row is tagged again here; `tag()`
 * upserts it at once, and the commit then writes the data over it. Every
 * `regenerate()` of a signed-in session other than `login()`'s, and the
 * forced logouts' (`endSession`), goes through this helper.
 */
export async function rotateSessionId(ctx: HttpContext) {
  const user = ctx.auth.getUserOrFail()
  ctx.session.regenerate()
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

/*
 * The routes a guest may use with an emailed token, and the reset request
 * that leads to one (docs/07 §3.3 row 3, its exception): the pages
 * `/verify-email`, `/forgot-password`, `/reset-password` and `/mfa` (the
 * enrolment link, M1 part 5), and the operations the first three post to.
 * On these, a stale session (a stamp that no longer matches, or past the
 * 30-day limit) is ended and the request goes on as a guest's, and no
 * sign-in redirect ever carries their URL as `return_to`, because the URL
 * can hold a live token (07 §3.8). `/mfa` signs the guest in on the page
 * itself and keeps the token in memory; its operations need a session, so
 * they are not on this list.
 */
export const GUEST_TOKEN_ROUTES: ReadonlySet<string> = new Set([
  'verify_email',
  'forgot_password',
  'reset_password',
  'mfa',
  'confirmEmail',
  'requestPasswordReset',
  'resetPassword',
])

export const onGuestTokenRoute = (ctx: HttpContext) => GUEST_TOKEN_ROUTES.has(ctx.route?.name ?? '')

// Shield's session key for its CSRF secret (@adonisjs/shield 9.0.0 `CsrfGuard`).
const CSRF_SECRET_KEY = 'csrf-secret'

/*
 * The forced logout of a stale session on a guest token route: `endSession`,
 * then Shield's CSRF secret is put back into the new, guest session. Shield
 * has already checked this request and set the `XSRF-TOKEN` cookie from
 * that secret, so the page this request renders can still post its form;
 * without it the first post would fail the CSRF check. The secret belongs to
 * the browser, not the account, as when `logIn` keeps it (07 §3.2). Nothing
 * else of the old sign-in survives.
 */
export async function endSessionAsGuest(ctx: HttpContext) {
  const secret: unknown = ctx.session.get(CSRF_SECRET_KEY)
  await endSession(ctx)
  if (typeof secret === 'string') ctx.session.put(CSRF_SECRET_KEY, secret)
}

/*
 * Inertia props a poll asks for (docs/07 §3.4); today the seller
 * dashboard's new-order count (FR-NOT-003).
 */
export const POLL_PROPS: ReadonlySet<string> = new Set(['newOrderCount'])

/*
 * Whether a request is user-initiated, so it refreshes an idle clock
 * (`seller_seen_at`, `admin_seen_at`; docs/07 §3.4): a page visit, full or
 * Inertia, or an unsafe API method. A poll never is: a request with
 * `X-Poll: 1`, or an Inertia partial reload that asks only for poll props.
 */
export function isUserInitiated(ctx: HttpContext) {
  const request = ctx.request
  if (request.header('x-poll') === '1') return false
  const method = request.method()
  if (request.url().startsWith('/api/')) return !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (method !== 'GET') return false
  const partial = request.header('x-inertia-partial-data')
  if (!partial) return true
  const props = partial.split(',').map((prop) => prop.trim())
  return !props.every((prop) => POLL_PROPS.has(prop))
}

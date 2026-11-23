import db from '@adonisjs/lucid/services/db'
import router from '@adonisjs/core/services/router'
import User from '#models/user'
import { startSession, SESSION_KEYS } from '#controllers/support/session'
import env from '#start/env'
import { testBrowser, type Browser } from '#tests/support/browser'
import { insertUser } from '#tests/support/schema_rows'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'

/*
 * HTTP helpers of the courier operation tests (docs/06 §13.8). Signing in
 * uses `startSession`, as `logIn` does; a staff session's MFA time stands in
 * for `verifyMfaChallenge` (M1 part 5), stored as the challenge stores it,
 * `{ user_id, at }` (docs/07 §3.2). A proof counts only when it is not
 * older than the sign-in, so with an MFA time the session's
 * `authenticated_at` is set to it when it is earlier than now; the 7-day
 * staff limit and the 2-hour admin idle limit (`admin_seen_at`, now) still
 * pass for the times the tests use. The test route is registered once, on
 * first import.
 */

router.get('/__test__/courier/sign-in/:id', async (ctx) => {
  const user = await User.findOrFail(ctx.params.id)
  await user.refresh()
  await startSession(ctx, user, user.securityStamp)
  const at = ctx.request.qs().mfa_verified_at
  if (typeof at === 'string') {
    const signedInAt = ctx.session.get(SESSION_KEYS.authenticatedAt)
    if (typeof signedInAt === 'string' && Date.parse(at) < Date.parse(signedInAt)) {
      ctx.session.put(SESSION_KEYS.authenticatedAt, at)
    }
    ctx.session.put(SESSION_KEYS.mfaVerifiedAt, { user_id: user.id, at })
  }
  // The session-limit tests set the sign-in and admin times themselves (docs/07 §3.4).
  const { authenticated_at: signedIn, admin_seen_at: adminSeen } = ctx.request.qs()
  if (typeof signedIn === 'string') ctx.session.put(SESSION_KEYS.authenticatedAt, signedIn)
  if (typeof adminSeen === 'string') ctx.session.put(SESSION_KEYS.adminSeenAt, adminSeen)
  return { ok: true }
})

export async function signIn(
  userId: string,
  mfaVerifiedAt?: string,
  times: { authenticatedAt?: string; adminSeenAt?: string } = {}
) {
  const browser = testBrowser()
  const query = new URLSearchParams()
  if (mfaVerifiedAt) query.set('mfa_verified_at', mfaVerifiedAt)
  if (times.authenticatedAt) query.set('authenticated_at', times.authenticatedAt)
  if (times.adminSeenAt) query.set('admin_seen_at', times.adminSeenAt)
  const search = query.size > 0 ? `?${query.toString()}` : ''
  const response = await browser.request(`/__test__/courier/sign-in/${userId}${search}`)
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  return browser
}

export const serverUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export async function send(
  browser: Browser,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const response = await browser.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
    text,
  }
}

// The status of a response read asynchronously (lint: no member access on an await expression).
export async function statusOf(response: Promise<{ status: number }>) {
  const { status } = await response
  return status
}

export const key = () => `test-key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export async function member(shopId: string, role: string) {
  const userId = await insertUser()
  await db
    .table('shop_memberships')
    .insert({ shop_id: shopId, user_id: userId, role, status: 'active' })
  return userId
}

export async function staffUser(role: string) {
  const userId = await insertUser()
  await db
    .from('users')
    .where('id', userId)
    // users_mfa_check: MFA on needs a TOTP secret; a placeholder stands in for M1's enrolment.
    .update({
      status: 'active',
      email_verified_at: db.raw('now()'),
      mfa_enabled_at: db.raw('now()'),
      mfa_totp_secret_enc: placeholderCiphertext(),
    })
  await db.table('platform_staff').insert({ user_id: userId, role })
  return userId
}

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
 * uses `startSession`, as M1's `logIn` will; a staff session's MFA time stands
 * in for M1's challenge. The test route is registered once, on first import.
 */

router.get('/__test__/courier/sign-in/:id', async (ctx) => {
  const user = await User.findOrFail(ctx.params.id)
  await user.refresh()
  await startSession(ctx, user, user.securityStamp)
  const at = ctx.request.qs().mfa_verified_at
  if (typeof at === 'string') ctx.session.put(SESSION_KEYS.mfaVerifiedAt, at)
  return { ok: true }
})

export async function signIn(userId: string, mfaVerifiedAt?: string) {
  const browser = testBrowser()
  const query = mfaVerifiedAt ? `?mfa_verified_at=${encodeURIComponent(mfaVerifiedAt)}` : ''
  const response = await browser.request(`/__test__/courier/sign-in/${userId}${query}`)
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
